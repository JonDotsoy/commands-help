# git-assistant

Make messages for your commits with AI.

**Example:**

```shell
$ git commit
Loading...

commit 58809ff67700ef35506dd8488db7af0f63c2f580 (HEAD -> develop, origin/develop)
Author: Jonathan Delgado <hi@jon.soy>
Date:   Sat Feb 10 23:11:48 2024 -0300

    feat(git-assistant): Exclude CHANGELOG.md from Prettier formatting
    
    Added a `.prettierignore` file to the `git-assistant` directory to specifically exclude `CHANGELOG.md` from being formatted by Prettier. This change ensures that the formatting of the changelog file, which often follows a specific format that might be disrupted by automatic styling, is preserved as intended. Additionally, updated the `.gitignore` to explicitly include the `.prettierignore` file, ensuring it is tracked in the repository. This adjustment helps maintain the consistency and readability of the project's documentation by preventing unintended formatting changes.
```

Simple!

## About

git-assistant use [OpenAI](https://openai.com/) to generate commit messages.

### Installing

#### Installing with homebrew

```
brew install jondotsoy/core/git-assistant
```

#### Manual Install

1. clone this repo in you preferred folder
    - `git clone https://github.com/JonDotsoy/commands-help $FOLDER`
2. `cd $FOLDER/commands/git-assistant` and install dependencies with bun
3. `make install` to pull all dependencies
4. `make build` to build the binary file and call with `./dist/git-assistant`

Now you have a binary git-assistant to link it on your binary folders.

