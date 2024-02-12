import {
  command,
  flag,
  flags,
  isBooleanAt,
  isStringAt,
  makeHelmMessage,
  restArgumentsAt,
  rule,
  type Rule,
} from "@jondotsoy/flags";
import {
  inspect,
  pathToFileURL,
  readableStreamToArrayBuffer,
  readableStreamToText,
} from "bun";
import { homedir } from "os";
import { OpenAI } from "openai";
import { writeFile, mkdir, readFile, stat } from "fs/promises";
import chalk from "chalk";
import type { MessageContentText } from "openai/resources/beta/threads/messages/messages.mjs";
import { existsSync } from "fs";
import * as YAML from "yaml";
import ms from "ms";

// Global Environment
const envNoAssistant = (process.env.NO_ASSISTANT?.length ?? 0) > 0;
const gitAssistantDebug = (process.env.GIT_ASSISTANT_DEBUG?.length ?? 0) > 0;
const retrieveTimeOut = ms(process.env.GIT_ASSISTANT_TIMEOUT ?? "60s");

class ErrorNotFound extends Error {}

const sleep = async (t: number) => {
  const { promise, resolve, reject } = Promise.withResolvers<void>();

  setTimeout(resolve, t);

  await promise;
};

type Ctx = {
  stdout: WritableStream;
  stderr: WritableStream;
};

const HomeLocation = pathToFileURL(`${homedir()}/.git-assistant/`);
const OpenAIApiKeyLocation = new URL(`openai.apikey`, HomeLocation);
const OpenAIAssistantsLocation = new URL(`openai.assistants`, HomeLocation);

const setOpenAIToken = async (token: string) => {
  await writeFile(OpenAIApiKeyLocation, token, { mode: 0o600 });
};

const getOpenAIToken = async () => {
  if (!existsSync(OpenAIApiKeyLocation))
    throw new ErrorNotFound(`Missing OpenAI api key`);

  return new TextDecoder().decode(await readFile(OpenAIApiKeyLocation));
};

const getGitPathLocation = async () => {
  let startLocation = pathToFileURL(`${process.cwd()}/`);
  while (true) {
    const gitLocation = new URL(".git/", startLocation);
    const statGitLocation = existsSync(gitLocation)
      ? await stat(gitLocation)
      : null;
    if (statGitLocation?.isDirectory()) return gitLocation;
    if (startLocation.pathname === "/") return null;
    startLocation = new URL("../", startLocation);
  }
};

const prepareCommitMSGHook = `
COMMIT_MSG_FILE=$1
COMMIT_SOURCE=$2
SHA1=$3

git-assistant get-commit-message | cat - $COMMIT_MSG_FILE > $COMMIT_MSG_FILE-git-assistant
cat $COMMIT_MSG_FILE-git-assistant > $COMMIT_MSG_FILE
`.trimStart();

const getOpenAI = async () => {
  const apiKey = await getOpenAIToken();
  const openAI = new OpenAI({ apiKey });
  return openAI;
};

type Assistants = {
  commitMessage: string;
  PRMessage: string;
};

const setConfigAssistant = async (assistants: Assistants) => {
  await writeFile(OpenAIAssistantsLocation, YAML.stringify(assistants));
};

const getConfigAssistant = async () => {
  if (!existsSync(OpenAIAssistantsLocation))
    throw new ErrorNotFound(
      `Missing assistant to Open AI.\nPlease configure your assistant with ${chalk.green(`git-assistant init`)}.`,
    );

  const assistants = YAML.parse(
    new TextDecoder().decode(await readFile(OpenAIAssistantsLocation)),
  );

  return assistants as Assistants;
};

const gitDiffBranchFromMaster = async (options?: { mainBranch?: string }) => {
  const mainBranch = options?.mainBranch ?? "master";

  const childProcess = Bun.spawn({
    cmd: ["git", "--no-pager", "diff", `${mainBranch}..HEAD`],
    stdout: "pipe",
    stderr: "pipe",
  });

  return await readableStreamToText(childProcess.stdout);
};

const gitDiffStaged = async () => {
  const childProcess = Bun.spawn({
    cmd: ["git", "--no-pager", "diff", "--staged"],
    stdout: "pipe",
    stderr: "pipe",
  });

  return await readableStreamToText(childProcess.stdout);
};

const init = async (args: string[]) => {
  type Options = {
    token: string;
  };
  const rules: Rule<Options>[] = [
    rule(flag("--token", "-t"), isStringAt("token"), {
      description: "Token of openai",
    }),
  ];
  const options = flags<Options>(args, {}, rules);

  const getOpenAITokenSafe = async () => {
    try {
      return await getOpenAIToken();
    } catch (ex) {
      if (ex instanceof ErrorNotFound) return null;
      throw ex;
    }
  };

  const currentOpenAIToken = await getOpenAITokenSafe();
  const requiredToken = currentOpenAIToken === null;

  if (!options.token && requiredToken) throw new Error(`Missing --token flag`);

  await mkdir(HomeLocation, { recursive: true, mode: 0o700 });

  if (options.token) await setOpenAIToken(options.token);

  const openAI = await getOpenAI();

  const getConfigAssistantSafe = async () => {
    try {
      return await getConfigAssistant();
    } catch (ex) {
      if (ex instanceof ErrorNotFound) return null;
      throw ex;
    }
  };

  const currentAssistants = await getConfigAssistantSafe();

  const assistantCommitMessage = currentAssistants?.commitMessage
    ? await openAI.beta.assistants.retrieve(currentAssistants.commitMessage)
    : await openAI.beta.assistants.create({
        model: "gpt-4-turbo-preview",
        name: "(git-assistant) Generator Commit Message by Diff",
        instructions: `Please generate a commit message. Ensure that it includes a precise and informative subject line. If necessary, follow with an explanatory body providing insight into the nature of the changes, the reasoning behind them, and any significant consequences or considerations arising from them. Ensure the message begin with a conventional commit format. Please not split paragraph.`,
      });

  const assistantPRMessage = currentAssistants?.PRMessage
    ? await openAI.beta.assistants.retrieve(currentAssistants.PRMessage)
    : await openAI.beta.assistants.create({
        model: "gpt-4-turbo-preview",
        name: "(git-assistant) Generator RM Message by Diff",
        instructions: `Se entregara un cuerpo donde la primera linea sera el numero de ticket, la segunda linea sera el principal documento en que se enfoca el cambio (Debe ser usado para describir los cambios) y desde la tercera linea se entrega diferencias de git. 

Se debe entregar un document donde la primera linea sea un titulo en format conventional commit  y con el prefijo el nimero de ticket. Ej \`(FOO-30) feat: write good code\` en formato texto plano.

Luego un salto de linea 

Luego debe entregar el cuerpo donde la primera linea sea el ticket relacionado en formato markdown. Ej Ticket related: (FOO-30)[jiraurl]

Luego un salto de linea 

A continuación una sección Changes con el detallo de los cambios realizados, lo mas detallado posible en format markdown. Debe solo tener un titulo en todo el documento que diga "Changes" y un emoji al final del titulo.`,
      });

  await setConfigAssistant({
    commitMessage: assistantCommitMessage.id,
    PRMessage: assistantPRMessage.id,
  });
  console.log(`Store config assistants`);

  const gitDirLocation = await getGitPathLocation();

  if (!gitDirLocation) {
    await console.log(`Skip install hook`);
  } else {
    await writeFile(
      new URL("hooks/prepare-commit-msg", gitDirLocation),
      prepareCommitMSGHook,
      { mode: 0o700 },
    );
    console.log(`Installed git hook prepare-commit-msg`);
  }
};

// const logDirLocation = new URL('.logs/requests/', import.meta.url)
// await mkdir(logDirLocation, { recursive: true })
// const logCounter = { counter: 0, nextCounter: () => (logCounter.counter++).toString().padStart(5, '0') }

async function* simpleMessageToOpenAI(
  assistant_id: string,
  message_content: string,
) {
  const startTime = Date.now();

  const debug = (symbol: "|" | "<" | ">", message: string | (() => string)) => {
    if (gitAssistantDebug) {
      console.error(
        (typeof message === "function" ? message() : message)
          .split("\n")
          .map((part, index) =>
            index === 0 ? `${symbol} ${part}` : `  ${part}`,
          )
          .join("\n"),
      );
    }
  };
  debug("|", `assistant_id = ${assistant_id}`);
  debug("|", `message_content = ${message_content}`);

  const fnLog = async <T>(fn: () => Promise<T>): Promise<T> => {
    debug(">", () => `${fn.toString()}`);
    const res = await fn();
    debug("<", () => `${inspect(res, { depth: Infinity })}`);
    return res;
  };

  const openAI = await getOpenAI();

  const thread = await fnLog(() =>
    openAI.beta.threads.create({
      messages: [{ role: "user", content: message_content }],
    }),
  );

  const run = await fnLog(() =>
    openAI.beta.threads.runs.create(thread.id, { assistant_id }),
  );

  const listenerBeforeExit = async () => {
    await fnLog(() => openAI.beta.threads.runs.cancel(thread.id, run.id));
  };
  process.addListener("beforeExit", listenerBeforeExit);

  while (true) {
    const { status } = await fnLog(() =>
      openAI.beta.threads.runs.retrieve(thread.id, run.id),
    );

    if (status === "in_progress") {
      const duration = Date.now() - startTime;
      if (duration > retrieveTimeOut) {
        throw new Error(`OpenAI Run timeout of ${retrieveTimeOut}ms exceeded`);
      }
      await sleep(500);
      continue;
    }

    break;
  }

  process.removeListener("beforeExit", listenerBeforeExit);

  const messages = await fnLog(() =>
    openAI.beta.threads.messages.list(thread.id),
  );

  for await (const e of messages.iterPages()) {
    yield* await fnLog(async () => e.getPaginatedItems());
  }
}

const getCommitMessage = async (args: string[]) => {
  type Options = {};
  const rules: Rule<Options>[] = [];
  const options = flags<Options>(args, {}, rules);

  const currentDiff = await gitDiffStaged();
  const sizeCurrentDiff = currentDiff.trim().length;

  if (sizeCurrentDiff === 0) {
    process.stderr.write(`Without changes.\n`);
    return;
  }

  if (envNoAssistant) {
    return;
  }

  const assistant_id = (await getConfigAssistant()).commitMessage;

  process.stderr.write(`${chalk.gray(`Loading...`)}\n`);
  const messages = await Array.fromAsync(
    simpleMessageToOpenAI(assistant_id, currentDiff),
  );

  const value = messages
    .filter((message) => message.role === "assistant")
    .map((message) =>
      message.content
        .filter(
          (content): content is MessageContentText => content.type === "text",
        )
        .map((e) => e.text.value)
        .join("\n"),
    )
    .join("\n");

  process.stdout.write(value);
};

const getPRMessage = async (args: string[]) => {
  type Options = {
    mainBranch: string;
    ticketRelated: string;
  };
  const rules: Rule<Options>[] = [
    rule(flag("--main-branch"), isStringAt("mainBranch"), {
      description: "Main branch. Default `master`",
    }),
    rule(flag("--ticket-related"), isStringAt("ticketRelated"), {
      description: "Ticket related to create PR",
    }),
  ];
  const options = flags<Options>(args, {}, rules);

  const mainBranch = options.mainBranch ?? "master";
  const ticketRelated = options.ticketRelated ?? "[No ticket]";

  const currentDiff = await gitDiffBranchFromMaster({ mainBranch });

  const assistant_id = (await getConfigAssistant()).PRMessage;

  process.stderr.write(`${chalk.gray(`Loading...`)}\n`);
  const messages = await Array.fromAsync(
    simpleMessageToOpenAI(
      assistant_id,
      `${ticketRelated}\n\nNo definido.\n\n${currentDiff}`,
    ),
  );

  const value = messages
    .filter((message) => message.role === "assistant")
    .map((message) =>
      message.content
        .filter(
          (content): content is MessageContentText => content.type === "text",
        )
        .map((e) => e.text.value)
        .join("\n"),
    )
    .join("\n");

  process.stdout.write(value);
};

async function main(args: string[]) {
  type Options = {
    init: string[];
    getCommitMessage: string[];
    getPRMessage: string[];
  };
  const rules: Rule<Options>[] = [
    rule(command("init"), restArgumentsAt("init"), {
      description: "Sign in with a OpenAI token",
    }),
    rule(command("get-commit-message"), restArgumentsAt("getCommitMessage"), {
      description: "Create a commit message",
    }),
    rule(command("get-pr-message"), restArgumentsAt("getPRMessage"), {
      description: "Create a PR commit message. Title, changes and references",
    }),
  ];
  const options = flags<Options>(args, {}, rules);
  const makeHelp = () => makeHelmMessage("cli", rules);

  if (options.init) return init(options.init);
  if (options.getCommitMessage)
    return getCommitMessage(options.getCommitMessage);
  if (options.getPRMessage) return getPRMessage(options.getPRMessage);

  return console.log(makeHelp());
}

const bootstrap = async () => {
  await main(process.argv.slice(2));
};

await bootstrap().catch((ex) => {
  if (ex instanceof Error) {
    console.error(ex.message);
    return;
  }
  throw ex;
});
