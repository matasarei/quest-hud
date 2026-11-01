# quest-hud — notes for Claude

A Claude Code marketplace with one mod, `quest-hud` (`plugins/quest-hud/`): a hooks module
(`hooks/register.tsx`) over pure modules (`src/`), a state contract (`types/index.d.ts`), and a
status-line script (`scripts/hud-line.sh`). TypeScript run by the Claude Code engine; there is no
package.json, no build and no node_modules.

## Commands

| What | Command |
|---|---|
| Validate | `claude plugin validate . && claude plugin validate plugins/quest-hud` (the `version` warning is intended) |
| Test | `claude plugin test plugins/quest-hud`, then `bash plugins/quest-hud/tests/hud-line.sh` |
| Lint | `shellcheck --severity=warning plugins/quest-hud/scripts/*.sh plugins/quest-hud/tests/*.sh` |
| Type-check | `npx -y -p typescript tsc -p plugins/quest-hud`, once `plugins/quest-hud/.claude-plugin/types/` holds the engine's API types: an interactive `claude --plugin-dir` session lays them; a headless `claude -p` does not |
| Run | `claude --plugin-dir /Users/hc/Projects/quest-hud/plugins/quest-hud` in a throwaway git repository |

CI (`.github/workflows/checks.yml`) runs the same on every push and pull request, gated on
Claude Code 2.1.316 and, as a warning only, on the latest release.

## This project specifically

- **It costs nothing.** Never `$.model.*`, `prompt.compose`, `prompt.context`, or
  `$.session.usage({ breakdown })`; never `$.fs` writes. Nothing reaches the model.
- **Every hook observes.** It returns what `next(e)` resolved, unchanged, and closes with
  `.catch(($, e, next) => next(e))`. The HUD never rewrites or refuses anything.
- **It knows no skill pack.** It reads only what the engine passes for every session: skill
  name and description, the task tools, usage. No reading of `.quests/`, `.tasks/`, `.gku/` or
  any pack's files.
- **Logic lives in `src/`, pure and tested**; `register.tsx` is wiring and layout. A new rule
  is a new function with its test.
- **Outside text is drawn as plain `Text`**: skill names, task subjects, prompts. Never
  `Markdown` or `Link`. Titles go through `cleanTitle()`.
- **A helper that takes `$` is a top-level function declaration**; the validator follows `$`
  statically and refuses one bound inside `register`.
- **`resolve()` lists every element on every surface**; one a surface lacks draws as an empty
  fragment. Choose by `e.surface`, not by `'X' in elements`.
- **No `version`** in `plugin.json` or `marketplace.json`, so every commit is an update.
- Changes land through pull requests on `main`; identifiers and commit messages in English.
