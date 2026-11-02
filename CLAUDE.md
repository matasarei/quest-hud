# quest-hud — notes for Claude

A Claude Code marketplace with one mod, `quest-hud` (`plugins/quest-hud/`): a hooks module
(`hooks/register.tsx`, with the Road pane's layout in `hooks/pane.tsx`, the Quest Board's in
`hooks/board.tsx`, the level's readers in `hooks/survey.ts` and GitHub's in `hooks/github.ts`) over pure modules
(`src/`), a state contract (`types/index.d.ts`), and a status-line script
(`scripts/hud-line.sh`), and one user-only skill file per command (`skills/`). Tests are `plugins/quest-hud/tests/*.test.ts(x)`; `tests/kit.tsx`
stands for the engine in the newer ones. TypeScript run by the Claude Code engine; there is no
package.json, no build and no node_modules. The Road's art is drawn in code: `src/paint/`
paints (shapes, pixel sprites, a rasteriser, a PNG encoder, an Svg writer) and `src/world/`
holds what is painted (the landscapes, the cast and props as pixel maps, the palette).

## Commands

| What | Command |
|---|---|
| Validate | `claude plugin validate . && claude plugin validate plugins/quest-hud` (the `version` warning is intended) |
| Test | `claude plugin test plugins/quest-hud`, then `bash plugins/quest-hud/tests/hud-line.sh` and `bash plugins/quest-hud/tests/skills.sh` |
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
  `.catch(($, e, next) => next(e))`. The HUD never rewrites or refuses anything, with one
  exception: `detail = status` adds `tail` to `PromptHint`, after the engine's line and never in
  place of it. `$.ui.status` is not used: Claude Code draws it with a warning sign, in yellow.
- **Commands are user-only skills the mod answers.** A registered name cannot hold a colon, so
  `skills/<name>/SKILL.md` gives each command its `/quest-hud:<name>`, and a `command.run` hook
  answers it before any model turn. `disable-model-invocation: true` keeps it out of the context.
  A new command needs its skill file, its literal hook (a computed name fails validate), its
  word in the plain `/quest-hud` hook, its line in `src/help.ts`, and its name in
  `tests/skills.sh`. Only `$.store` is written: `/quest-hud:off`'s switch, and the level's card
  and survey.
- **It knows no skill pack.** Outside the level it reads only what the engine passes for every
  session: skill name and description, the task tools, usage. No reading of `.quests/`, `.tasks/`,
  `.gku/` or any pack's files, ever. Packs are named only by the fixed catalogue in
  `src/levelup.ts`, which the engine's command list and the enabled plugins are compared against.
- **The level reads the machine on command, and as counts.** Transcripts are read only by
  `/quest-hud:level`, in the background, through `$.process.spawn` of `grep`: `$.fs.read` refuses
  over 4 MiB and `$.process.run` cuts its output there. Never at a session start, never on a timer.
  `/quest-hud:level-up` reads the setup and the prompt history, and no transcript. `src/survey.ts`
  keeps names and counts: a command goes to `commandKinds()` and is dropped, a path gives its
  extension, a prompt its first `/word`. A project's path is used and never stored, so the store
  keys sessions by file name. `~/.claude.json` is never read, as it holds account details; of a
  settings file only hooks, permission rules, auto mode and enabled plugins are looked at. The
  transcript format is the engine's own and undocumented: a scan that finds nothing changes nothing
  and the card says "usage unread", as a part that could not be read leaves the sum rather than
  scoring zero. A catalogue row's command is printed, never run. The level is drawn only on the
  Road's meters row.
- **Logic lives in `src/`, pure and tested**; `register.tsx` is wiring and layout. A new rule
  is a new function with its test.
- **The board reads GitHub on command, through `gh`, and only reads.** `/quest-hud:quests` runs
  `gh api` with `$.process.run` in the background: never at a session start, never on a timer, and
  the mod never holds a token (no `$.http.fetch`). Every call is a read on github.com, as
  `tests/github.test.ts` pins: no `-X`, no `--method`, no fields on a REST path, nothing marked read.
  A title is outside text and goes only on the Quest Board: never in a command's answer (it may
  reach the model), the log, `$.store` or a counts row. The board lives in an atom, so private
  titles are never on disk. A secret alert's `--jq` keeps out the value. A part that could not be
  read is named on the board and keeps an empty one from reading as clear. Rank by what GitHub
  states, as the author's `__typename` for a bot: never by a title, which anyone can write.
- **Outside text is drawn as plain `Text`**: skill names, task subjects and GitHub titles. Never
  `Markdown`, and `Link` only on the Quest Board, with an href through `safeHref()` and a label
  built from that href's own parts: a title is never a link's text. Titles go through `cleanTitle()`. Prompts are never drawn: they only
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
  commit's sha and subject (through `cleanTitle()`), or a PR number — never the command. The
  level's survey counts kinds the same way, from what grep cut of a transcript's command.
  Scores read at most the last `SCORE_TAIL` characters of the output. A new shape is a row
  in `tests/bash.test.ts`'s table first.
- **The art is drawn in code, as pixel art.** Sprites in `src/world/sprites.ts` are pixel maps
  over `PALETTE`, two art pixels a unit, outlined and shaded from the upper left; a figure
  keeps its size (`tests/world.test.ts`), and a row is single-quoted, so no palette key is a
  quote or a backslash. Landscapes are shapes painted with `rasterize`'s pixel mode (hard
  edges, dithered gradients). An Image shows the art's own resolution (`sceneArt`, two pixels a
  unit); text cells show it with its rows halved, in quadrant characters, 2 × 2 pixels and two
  colours a cell (`artCells`), from art painted with `cells: true`, its dither held for each
  pair of rows (`ditherRows: 2`) — halving the rows of a normal Bayer dither leaves vertical
  stripes; the desktop's Svg shows it at one pixel a unit (`scene`). A
  Raster takes one printable width-1 BMP character a cell, so octants (U+1CD00) and
  sextants (U+1FB00) are out. The band's portrait is art the same way, each 2 × 2 block in at
  most two colours.
  The roadside (a zone's landmarks, and the chest) is scenery: it walks with the near layer
  and, in a zone change, slides with its own zone's backdrop by the same `slideShift`
  (`roadside()`). The party (`party()`: flags, wizard, mascot, ghosts, monsters, allies) is
  not scenery: in a zone change it glides from the old zone's layout to the new one
  (`partyAt()`, `glide()`), and a set that differs between the two swaps at the halfway frame.
  GitHub's Octocat, GitLab's fox and Claude's mascot are our own drawings, never logo files.
- **`resolve()` lists every element on every surface**; one a surface lacks draws as an empty
  fragment. Choose by `e.surface`, not by `'X' in elements`.
- **No `version`** in `plugin.json` or `marketplace.json`, so every commit is an update.
- Changes land through pull requests on `main`; identifiers and commit messages in English.
