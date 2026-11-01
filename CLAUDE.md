# quest-hud — notes for Claude

A Claude Code marketplace with one mod, `quest-hud` (`plugins/quest-hud/`): a hooks module
(`hooks/register.tsx`, with the Road pane's layout in `hooks/pane.tsx`) over pure modules
(`src/`), a state contract (`types/index.d.ts`), and a status-line script
(`scripts/hud-line.sh`). Tests are `plugins/quest-hud/tests/*.test.ts(x)`; `tests/kit.tsx`
stands for the engine in the newer ones. TypeScript run by the Claude Code engine; there is no
package.json, no build and no node_modules. The Road's art is drawn in code: `src/paint/`
paints (shapes, pixel sprites, a rasteriser, a PNG encoder, an Svg writer) and `src/world/`
holds what is painted (the landscapes, the cast and props as pixel maps, the palette).

## Commands

| What | Command |
|---|---|
| Validate | `claude plugin validate . && claude plugin validate plugins/quest-hud` (the `version` warning is intended) |
| Test | `claude plugin test plugins/quest-hud`, then `bash plugins/quest-hud/tests/hud-line.sh` |
| Lint | `shellcheck --severity=warning plugins/quest-hud/scripts/*.sh plugins/quest-hud/tests/*.sh` |
| Type-check | `npx -y -p typescript tsc -p plugins/quest-hud`, once `plugins/quest-hud/.claude-plugin/types/` holds the engine's API types: an interactive `claude --plugin-dir` session lays them; a headless `claude -p` does not |
| Run | `claude --plugin-dir /Users/hc/Projects/quest-hud/plugins/quest-hud` in a throwaway git repository |

CI (`.github/workflows/checks.yml`) runs the same on every push and pull request, gated on
Claude Code 2.1.316 and, as a warning only, on the latest release. Its bidi scan reads text
files only (`git grep -I`): perl dies on binary input.

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
- **Outside text is drawn as plain `Text`**: skill names and task subjects. Never
  `Markdown` or `Link`. Titles go through `cleanTitle()`. Prompts are never drawn: they only
  end a finished skill's quest (`afterPrompt()`).
- **Never write `\u` escapes through a tool that may decode them**: check new source with the
  CI step's bidi scan; a literal bidirectional control character is refused.
- **A helper that takes `$` is a top-level function declaration**; the validator follows `$`
  statically and refuses one bound inside `register`.
- **Atoms live in `register.tsx`, the file that reads and writes them**: the engine's scan
  refuses `read`/`update` of an atom defined in another file. `hooks/pane.tsx` draws only the
  values passed to it.
- **The animation is one timer at most**, every `ANIM_MS` (250 ms, four frames a second),
  started by the main loop's `turn.start` or a zone change, only when the pane is shown and
  drawn in a terminal (cells or an image). It stops at `turn.complete`, `ui.close`, a pane no
  longer shown, a refused blit, a new session, or a zone's slide ending while Claude is idle,
  and stopping blits the frame at rest. The desktop's Svg never animates. The only other timer
  is the image probe: one `$.clock.after` per session, after the first image draw in `auto`.
  Nothing else may run on a timer.
- **Bash commands are read by `src/bash.ts` only, and never drawn.** It recognises known
  shapes (a test runner, a linter, `git commit`, `gh`, `glab`, behind known wrappers), and
  a mention inside quotes, a heredoc or `echo` is not a run. Callers draw a kind, a score, a
  commit's sha and subject (through `cleanTitle()`), or a PR number — never the command.
  Scores read at most the last `SCORE_TAIL` characters of the output. A new shape is a row
  in `tests/bash.test.ts`'s table first.
- **The art is drawn in code, as pixel art.** Sprites in `src/world/sprites.ts` are pixel maps
  over `PALETTE`, two art pixels a unit, outlined and shaded from the upper left; a figure
  keeps its size (`tests/world.test.ts`), and a row is single-quoted, so no palette key is a
  quote or a backslash. Landscapes are shapes painted with `rasterize`'s pixel mode (hard
  edges, dithered gradients). The scene is reduced to one pixel a unit for every surface.
  GitHub's Octocat, GitLab's fox and Claude's mascot are our own drawings, never logo files.
- **`resolve()` lists every element on every surface**; one a surface lacks draws as an empty
  fragment. Choose by `e.surface`, not by `'X' in elements`.
- **No `version`** in `plugin.json` or `marketplace.json`, so every commit is an update.
- Changes land through pull requests on `main`; identifiers and commit messages in English.
