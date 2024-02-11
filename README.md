# Commands

- take (`commands/take.zsh`): Therefore, this command checks if the directory exists and moves into it if it does, or creates the directory and moves into it if it does not exist.

## git-assistant

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
