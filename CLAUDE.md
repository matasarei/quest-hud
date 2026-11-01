# quest-hud — notes for Claude

A Claude Code marketplace with one mod, `quest-hud` (`plugins/quest-hud/`): a hooks module
(`hooks/register.tsx`, with the Road pane's layout in `hooks/pane.tsx`) over pure modules
(`src/`), a state contract (`types/index.d.ts`), and a status-line script
(`scripts/hud-line.sh`). Tests are `plugins/quest-hud/tests/*.test.ts(x)`; `tests/kit.tsx`
stands for the engine in the newer ones. TypeScript run by the Claude Code engine; there is no
package.json, no build and no node_modules. Outside the plugin: `art/1-bit-pack/` (Kenney's
1-Bit Pack sheet and its CC0 licence) and `tools/` (the Python 3 import that cuts the sprites
the scene uses from that sheet into `src/art/sprites.ts`).

## Commands

| What | Command |
|---|---|
| Validate | `claude plugin validate . && claude plugin validate plugins/quest-hud` (the `version` warning is intended) |
| Test | `claude plugin test plugins/quest-hud`, then `bash plugins/quest-hud/tests/hud-line.sh` |
| Lint | `shellcheck --severity=warning plugins/quest-hud/scripts/*.sh plugins/quest-hud/tests/*.sh` |
| Type-check | `npx -y -p typescript tsc -p plugins/quest-hud`, once `plugins/quest-hud/.claude-plugin/types/` holds the engine's API types: an interactive `claude --plugin-dir` session lays them; a headless `claude -p` does not |
| Run | `claude --plugin-dir /Users/hc/Projects/quest-hud/plugins/quest-hud` in a throwaway git repository |
| Re-import the art | `python3 -I tools/import-art.py`, then `git diff --exit-code plugins/quest-hud/src/art/sprites.ts` on a second run (it must not change) |

CI (`.github/workflows/checks.yml`) runs the same on every push and pull request, gated on
Claude Code 2.1.316 and, as a warning only, on the latest release. Its bidi scan reads text
files only (`git grep -I`): perl dies on binary input such as the art's PNG sheet.

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
- **The bob is one timer at most**, started by the main loop's `turn.start` only when the pane
  is shown and drawn as cells, stopped by `turn.complete`, `ui.close`, a pane no longer shown,
  or a refused blit — and stopping blits the frame at rest. The only other timer is the image
  probe: one `$.clock.after` per session, after the first image draw in `auto`. Nothing else
  may run on a timer; an image scene never animates.
- **Never edit `src/art/sprites.ts` by hand**: it is generated. Change the tile list in
  `tools/import-art.py` (sprites by tile number on `art/1-bit-pack/colored-transparent_packed.png`,
  kept unmodified from the pack), then re-import. Ship only sprites the scene uses;
  `tests/art.test.ts` lists them and fails on an unused one. The pack draws each sprite in one
  colour: the scene repaints the wizard, the ghosts and the flags.
- **`resolve()` lists every element on every surface**; one a surface lacks draws as an empty
  fragment. Choose by `e.surface`, not by `'X' in elements`.
- **No `version`** in `plugin.json` or `marketplace.json`, so every commit is an update.
- Changes land through pull requests on `main`; identifiers and commit messages in English.
