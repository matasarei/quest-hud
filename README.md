<p align="center">
  <img src="assets/banner.png" alt="Quest HUD — the wizard and Claude's mascot walk the road; a dragon and bugs wait ahead" width="200">
</p>

<h1 align="center">Quest HUD</h1>

<p align="center">A Claude Code mod that draws the session as a small game: HP and MP bars for the weekly limit and the context window, and the skill and tasks you are on.</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-D97757?style=for-the-badge&logo=claude&logoColor=white" alt="Claude Code" /> <img src="https://img.shields.io/badge/License-MIT-3DA639?style=for-the-badge" alt="License: MIT" /> <a href="https://github.com/matasarei/quest-hud/actions/workflows/checks.yml"><img src="https://img.shields.io/github/actions/workflow/status/matasarei/quest-hud/checks.yml?style=for-the-badge&label=checks" alt="checks" /></a>
</p>

A HUD is a heads-up display: the health bars and quest line a game keeps on screen while you
play. Quest HUD is a Claude Code mod that draws your session that way, above the prompt:

```
[avatar]  The anvil is hot. Strike while it lasts.
          ⚔ gku:implement  Forge  task 2/5 · Write the CSV writer tests
          ♥ HP █████████░░░░░ 62% week · heals in 2d 4h   ✦ MP ████████░░░░░░ 59% ctx · 82k/200k
```

- **♥ HP**: what is left of your weekly usage window. It turns yellow below 40% and red below 20%.
- **✦ MP**: what is left of the context window.
- **⚔ the quest**: the running skill, from any plugin, and its zone, with Claude Code's task list.
- **The line above it**: a tip when this session calls for one, otherwise a word from the zone. It changes at each turn, and `flavor = off` removes it.

It costs nothing: no model calls, nothing added to the context, and nothing written into your
project. It reads your past sessions only if you ask it to, with
[`/quest-hud:level`](#your-level), and then keeps counts, not what they said. It uses the network
only if you ask it to, with [`/quest-hud:quests`](#the-quest-board), through your own `gh`.

**[Try it live in your browser](https://matasarei.github.io/quest-hud/)**: the settings and commands, on the mod's real drawing code and an invented session.

[Install](#install) · [Update](#update) · [Settings](#settings) · [Commands](#commands) · [Your level](#your-level) · [The Quest Board](#the-quest-board) · [The Road](#the-road) · [Without mods](#without-mods) · [Art](#art) · [Development](#development) · [License](#license)

## Install

At the prompt of a Claude Code session:

```
/plugin install quest-hud --marketplace matasarei/quest-hud
```

Answer `y` to add the marketplace, then pick a scope. From a shell:
`claude plugin install quest-hud --marketplace matasarei/quest-hud`.

Requires Claude Code **2.1.316** or later. The mod API is early access and may change between
releases.

## Update

```bash
claude plugin marketplace update quest-hud
claude plugin update quest-hud@quest-hud
```

Then restart Claude Code.

An update can't reach a status line you copied to `~/.claude/hud-line.sh`, and an older copy
silently ignores `--all`. To update it, copy the script again: `/quest-hud:statusline` prints the
command.

## Settings

Run `/plugin configure quest-hud@quest-hud`, then `/reload-plugins`.

| Option | Values | Default | What it does |
|---|---|---|---|
| `detail` | `off`, `status`, `band`, `pane` | `band` | nothing; dim bars on the hint line under the prompt (terminal only, so use `band` in the desktop app); the band above the prompt; or the band, with the Road opened when the session starts (placed from 144 columns) |
| `bars` | `hpmp`, `all` | `hpmp` | `all` adds the 5-hour window (⚡) and the session cost (◉) |
| `avatar` | `wizard`, `claude`, `octocat` | `wizard` | who the band's portrait shows: the wizard, Claude's mascot or GitHub's Octocat. The Road keeps its own cast |
| `flavor` | `on`, `off` | `on` | one dim line above the quest on the band: a tip when this session calls for one (a standing monster, MP or HP below 20%), otherwise a word from the zone. It changes at each turn |
| `zones` | `name=zone, …` | empty | extra skill-to-zone rules, e.g. `quest=forge, triage=map` |
| `graphics` | `auto`, `cells`, `images` | `auto` | how a terminal draws the Road's scene: found out once a session, or always cells, or always images |

Zones: `watchtower`, `harbour`, `dungeon`, `arena`, `forge`, `map`, `camp`, `wilds`. A name
is a skill's full name (`gku:plan`) or the part after the plugin prefix (`plan`).

## Commands

| Command | What it does |
|---|---|
| `/quest-hud:status` | prints the current state, what the zone means, and the task list |
| `/quest-hud:pane` | opens the Road at any width |
| `/quest-hud:level` | reads your setup and sessions, as counts, and [scores the harness](#your-level) from 1 to 10 |
| `/quest-hud:level-up` | quests for the next level: what to add, picked from what you work on |
| `/quest-hud:quests` | your open GitHub work and alerts as quests on [the Quest Board](#the-quest-board), ranked and linked |
| `/quest-hud:statusline` | prints the setup for [the status line](#without-mods) |
| `/quest-hud:off` | hides the band, the hint-line bars and the Road in every session, until `on`; it comes back up to date |
| `/quest-hud:on` | brings them back, with the Road if `off` closed it |
| `/quest-hud:help` | lists the commands and the options, with the values in force |

The mod answers each one itself, with no model call. `/quest-hud pane` with a space works too,
and a word `/quest-hud` does not know shows the list. A typo after the colon, such as
`/quest-hud:pan`, reaches the model as an ordinary message.

The only file the mod writes is a small JSON file in Claude Code's configuration folder: `off`'s
switch, and your level with the counts behind it.

## Your level

`/quest-hud:level` scores your Claude Code setup from 1 (Novice) to 10 (Grand Wizard) and shows
the level on the Road, beside the bars. It describes the environment, not you, and the scale is
this game's own, not a benchmark.

| Part | What raises it |
|---|---|
| Instructions | a `CLAUDE.md` or `AGENTS.md` in the projects you work in |
| Memory | notes kept across projects |
| Skills | skills you run, not only ones installed, and one of your own |
| Checks | test and lint runs in the sessions that edit code |
| Guardrails | hooks and deny rules |
| Tools | a language server for your main language, and an MCP server in use |
| Delegation | subagents in use, and one of your own |

`/quest-hud:level-up` then lists up to five quests, weakest part first, from a fixed list in the
mod. Each gives your own number and the command to run, and the mod runs none of them: read a pack
before you install it, as a skill runs with your permissions.

**What it reads.** Only when you run `/quest-hud:level`, and in the background, so the first answer
comes at once and the level follows a little later (about 20 seconds for 3 GB of sessions):

- your sessions in `~/.claude/projects`, through `grep`, which stops inside each tool's input, so
  no prompt, output or file content is read: it keeps tool and skill names, file extensions and
  the kind of command;
- `~/.claude/history.jsonl`, for the projects you work in and the first `/word` of a prompt;
- your settings, the command list, and whether each project has its own instructions.

Later runs read only what changed. Nothing is sent anywhere, and no prompt, command or path is
stored. Claude Code deletes old sessions (30 days by default), so the level covers what is left.

The first run needs `grep`, which Windows does not have: there the card says `usage unread`, and
Checks and Delegation are left out of the score rather than counted as zero.

## The Quest Board

`/quest-hud:quests` opens a pane of what is waiting for you on GitHub, highest first, each row a link
to its page. It answers at once and reads in the background: the rows come in about ten seconds,
and the security scan about seven more. When it ends, a line in the conversation gives the counts.

The ranks are World of Warcraft's creature classifications:

| Rank | What it holds |
|---|---|
| **Boss** | a leaked secret, or a Dependabot or code-scanning alert rated critical or high |
| **Rare Elite** | a pull request with your review requested: someone is waiting on you |
| **Elite** | your pull request with changes requested, failing checks or a conflict |
| **Rare** | a mention you have not answered, an unanswered question in a repository you can write to, an issue assigned to you, your pull request approved and green |
| **Normal** | moderate and low alerts, then the open issues and pull requests in your repositories, your other pull requests and issues, then drafts |
| **Minion** | any other unread notification, and pull requests a bot opened |
| **Trivial** | idle for over 90 days, folded behind a button. An alert or an unread row never drops here |

Within a rank the repository you are working in comes first, then the most recently updated.
Alerts for one package in one repository are one row with a count.

**What it reads.** Only when you run it, through your own [`gh`](https://cli.github.com), so the mod
never holds your token:

- one GraphQL query for your repositories, their open work and Dependabot alerts, and your reviews,
  pull requests, assignments, mentions and discussions;
- your unread notifications, which it does not mark as read;
- secret-scanning and code-scanning alerts in your 20 most recently pushed repositories, since GitHub
  has no account-wide read of them. The board says how many it scanned. A leaked secret's value
  never reaches the mod.

It changes nothing on GitHub. Nothing it reads is written to disk, and a `/clear` or a new session
empties the board. Titles are written by other people, so they are drawn only on the board, as
plain text, and never go into a command's answer. A part it could not read is named on the board,
and a short list then does not read as a clear one. github.com only, not GitHub Enterprise Server.

## The Road

`/quest-hud:pane` opens the Road beside the transcript (docked in fullscreen from 110 columns,
inline above the prompt below that):

```
⚔ gku:implement · Forge — building and fixing        task 2/5 · loot 1
[14 rows of pixel art: the zone's landscape, a flag per task, the wizard and Claude's mascot,
 a daemon-ghost per subagent, a monster in a fight, a chest, GitHub's Octocat, GitLab's fox]
with Explore
▸ Write the CSV writer tests
· Wire it in
♥ ████████░░ 80%   ✦ █████░░░░░ 57%
— log —
19:04 skill gku:implement · Forge
19:07 fight tests lost · 231 pass · 1 fail
19:10 loot  2af33ea Write the CSV writer tests
19:11 ally  PR #3 opened
```

One flag per task. They appear only when Claude uses its task list.

Your prompts are never shown. A skill's quest ends when you
ask for something new (three words or more) with no task open, and `/clear` starts the Road over.

**Zones.** A skill's zone comes from its name and description:

| Zone | Means | Skills like |
|---|---|---|
| Map room | planning and research | plan, research, design, spec |
| Forge | building and fixing | implement, fix, build, refactor |
| Arena | review and tests | review, verify, test, lint |
| Harbour | pull requests and releases | pr, mr, merge, release, deploy |
| Watchtower | reviewing someone else's change | a name with review and pr/mr |
| Dungeon | auditing the whole repository | audit, security |
| Camp | setup and docs | init, setup, config, docs |
| Wilds | no skill running | anything else |

**Fights, loot and allies.** Some Bash commands show on the Road. The HUD reads the command and
its output, and never shows a command as typed.

| Command | On the Road | In the log |
|---|---|---|
| a test run: `npm test`, `pytest`, `go test`, `cargo test`, `phpunit` and others | a monster: a **skeleton** in the Dungeon, a **fire golem** in the Forge, **flying books** in the Map room, a **dragon** elsewhere. After a failed run it stays until a run of the same kind passes | `fight tests won` or `lost`, with the score |
| a lint or type check: `eslint`, `ruff check`, `mypy`, `tsc --noEmit`, `shellcheck` and others | a **spider**, the same way | `fight lint won` or `lost` |
| `git commit` | a **chest**, and `loot N` in the header | `loot`, with the short sha and subject |
| `gh` | **GitHub's Octocat**, for the rest of the session | `ally PR #3 opened`, `merged`, checks passed or failed |
| `glab` | **GitLab's fox**, for the rest of the session | `ally MR !12 opened`, and so on |

Wrapped commands count (`cd app && npm test`, `uv run pytest`); a mention does not (`echo "npm
test"`). A subagent's test and lint runs are fights; its commits and `gh` calls are not. A run in
the background, or interrupted, changes nothing.

**On a narrow pane** the road keeps the wizard, three task flags and any monster. Things give way
in turn: the zone's landmarks from the left, keeping its last one, then the fox, the Octocat and
the chest, then that last prop. Below 32 columns the pane draws no scene.

**In a short pane** the scene goes, and the header, tasks, bars and log keep the room. It needs 16
rows, one more for the task in progress, and one for the companions when there are any.

**Animation.** While Claude works, the Road walks at four frames a second; in a fight the wizard
stops and strikes, and a zone change slides the landscape. The band's avatar moves with it, with or
without the Road open: the wizard casts, Claude's mascot hops, the Octocat moves its tentacles. When
Claude is idle, nothing is drawn.

**Images or text cells.** Where the terminal shows images (kitty, Ghostty, iTerm2 3.5+), the scene
is a small PNG. Everywhere else it is quadrant text cells (`▖▝▞`). `graphics = auto` tries the
image once a session. On the desktop app the scene is a still SVG.

## Without mods

`scripts/hud-line.sh` shows the HP and MP bars in the classic status line:

```
♥▰▰▰▰▰▰▱▱▱▱ 62% ✦▰▰▰▰▰▰▱▱▱▱ 59%
```

Where the mod runs, `/quest-hud:statusline` prints both steps. Otherwise, copy
`plugins/quest-hud/scripts/hud-line.sh` to `~/.claude/hud-line.sh`, and add to
`~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "~/.claude/hud-line.sh" }
```

It needs `jq`. HP appears only on a Pro, Max or Ultra subscription; MP is full until the first
response reports the fill.

To add the 5-hour window used and the session's cost, end the command with `--all`. The `bars`
setting cannot reach this script, as it is copied out on its own:

```
♥▰▰▰▰▰▰▱▱▱▱ 62% ✦▰▰▰▰▰▰▱▱▱▱ 59% ⚡24% ◉$1.84
```

HP is green, yellow below 40% and red below 20%, MP is blue, and `--all`'s two are orange and
gold, in your terminal's 256 colours.
The `status` hint line takes no colours: Claude Code draws it dim.

## Art

The band's flavour lines are written for this mod, in the spirit of table and raid games. None is
quoted from a game. The art in the mod is drawn in code, as shapes (`src/world/landscapes.ts`) and pixel maps
(`src/world/sprites.ts`). GitHub's Octocat, GitLab's fox and Claude's mascot are our own drawings of
them, not their logo files.

The banner was generated with Google Gemini from the
[claude-rpg](https://github.com/matasarei/claude-rpg) banner.

## Development

```bash
claude plugin validate . && claude plugin validate plugins/quest-hud
claude plugin test plugins/quest-hud
bash plugins/quest-hud/tests/hud-line.sh
bash plugins/quest-hud/tests/skills.sh
shellcheck --severity=warning plugins/quest-hud/scripts/*.sh plugins/quest-hud/tests/*.sh site/*.sh site/tests/*.sh
```

Run it from disk: `claude --plugin-dir plugins/quest-hud`; saving a file reloads the mod.

The [live preview](https://matasarei.github.io/quest-hud/) lives in `site/`, outside the mod, and deploys from `main`. It needs Node and Chrome:

```bash
bash site/build.sh && bash site/test.sh && bash site/tests/smoke.sh
python3 -m http.server -d _site 8000
```

## License

MIT. See [LICENSE](LICENSE).
