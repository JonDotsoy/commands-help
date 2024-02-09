import { command, flag, flags, isStringAt, makeHelmMessage, restArgumentsAt, rule, type Rule } from "@jondotsoy/flags";
import { inspect, pathToFileURL, readableStreamToArrayBuffer, readableStreamToText } from "bun";
import { homedir } from "os";
import { OpenAI } from "openai";
import { writeFile, mkdir, readFile } from "fs/promises";
import chalk from "chalk";
import type { MessageContentText } from "openai/resources/beta/threads/messages/messages.mjs";

const sleep = async (t: number) => {
  const { promise, resolve, reject } = Promise.withResolvers<void>()

  setTimeout(resolve, t);

  await promise
}

type Ctx = {
  stdout: WritableStream;
  stderr: WritableStream;
};

const HomeLocation = pathToFileURL(`${homedir()}/`);
const OpenAIApiKeyLocation = new URL(`.openai/auth.token`, HomeLocation);

const getOpenAI = async () => {
  const apiKey = new TextDecoder().decode(await readFile(OpenAIApiKeyLocation))
  const openAI = new OpenAI({ apiKey })
  return openAI;
}

const gitDiff = async () => {
  const childProcess = Bun.spawn({
    cmd: ['git', '--no-pager', 'diff', '--staged'],
    stdout: 'pipe',
    stderr: 'pipe',
  })

  return await readableStreamToText(childProcess.stdout)
}

const sign = async (args: string[]) => {
  type Options = {
    token: string
  };
  const rules: Rule<Options>[] = [
    rule(flag('--token', '-t'), isStringAt('token'), { description: 'Token of openai' })
  ];
  const options = flags<Options>(args, {}, rules);

  if (!options.token) throw new Error(`Missing --token flag`)

  await mkdir(new URL('./', OpenAIApiKeyLocation), { recursive: true, mode: 0o700 })
  await writeFile(OpenAIApiKeyLocation, options.token, { mode: 0o600 })
  console.log(`Token stored`)
}

const logDirLocation = new URL('.logs/requests/', import.meta.url)
await mkdir(logDirLocation, { recursive: true })
const logCounter = { counter: 0, nextCounter: () => (logCounter.counter++).toString().padStart(5, '0') }

async function* simpleMessageToOpenAI(assistant_id: string, message_content: string) {
  const fnLog = async <T>(fn: () => Promise<T>): Promise<T> => {
    const logLocationRequest = new URL(`${Date.now()}-${logCounter.nextCounter()}.req`, logDirLocation)
    const logLocationResponse = new URL(`${Date.now()}-${logCounter.nextCounter()}.res`, logDirLocation)
    await writeFile(logLocationRequest, `${fn.toString()}`)
    const res = await fn()
    await writeFile(logLocationResponse, `${inspect(res, { depth: Infinity })}`)
    return res
  }

  const openAI = await getOpenAI()


  const thread = await fnLog(() => openAI.beta.threads.create())

  await fnLog(() => openAI.beta.threads.messages.create(thread.id, { role: 'user', content: message_content }))

  const run = await fnLog(() => openAI.beta.threads.runs.create(thread.id, { assistant_id }))

  while (true) {
    const { status } = await fnLog(() => openAI.beta.threads.runs.retrieve(thread.id, run.id))

    if (status === 'in_progress') {
      await sleep(500);
      continue;
    }

    break;
  }

  const messages = await fnLog(() => openAI.beta.threads.messages.list(thread.id))

  for await (const e of messages.iterPages()) {
    yield* await fnLog(async () => e.getPaginatedItems())
  }
}

const getCommitMessage = async (args: string[]) => {
  type Options = {};
  const rules: Rule<Options>[] = [];
  const options = flags<Options>(args, {}, rules);

  const currentDiff = await gitDiff()

  const assistant_id = 'asst_fw8RhO22vlGCAK6Hlz6HAyHn'

  process.stderr.write(`${chalk.gray(`Loading...`)}\n`)
  const messages = await Array.fromAsync(
    simpleMessageToOpenAI(assistant_id, currentDiff),
  )

  const value = messages
    .filter((message) => message.role === 'assistant')
    .map(message =>
      message
        .content
        .filter((content): content is MessageContentText => content.type === 'text')
        .map(e => e.text.value)
        .join('\n')
    )
    .join('\n');

  process.stdout.write(value)
}

async function main(args: string[]) {
  type Options = {
    sign: string[],
    'getCommitMessage': string[],
  };
  const rules: Rule<Options>[] = [
    rule(command('sign'), restArgumentsAt('sign'), { description: 'Sign in with a token' }),
    rule(command('get-commit-message'), restArgumentsAt('getCommitMessage'), { description: 'Create a commit message' }),
  ];
  const options = flags<Options>(args, {}, rules);
  const makeHelp = () => makeHelmMessage('cli', rules)

  if (options.sign) return sign(options.sign)
  if (options.getCommitMessage) return getCommitMessage(options.getCommitMessage)

  return console.log(makeHelp())
}

const bootstrap = async () => {
  await main(process.argv.slice(2));
};

await bootstrap()
  .catch((ex) => {
    if (ex instanceof Error) {
      console.error(ex.message);
      return;
    }
    throw ex;
  });
