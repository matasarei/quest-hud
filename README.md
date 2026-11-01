# Quest HUD

A Claude Code mod that draws your session as a small game, above the prompt:

```
[avatar]  ⚔ gku:implement  Forge  task 2/5 · Write the CSV writer tests
          ♥ HP █████████░░░░░ 62% week · heals in 2d 4h   ✦ MP ████████░░░░░░ 59% ctx · 82k/200k
```

- **♥ HP (green)**: what is left of your weekly usage window.
- **✦ MP (blue)**: what is left of the context window.
- **⚔ the quest**: the skill that is running (any skill, from any plugin) and the **zone** it
  works in, or the **Wilds** when none is; and Claude Code's own task list: how many tasks are
  done and which one is in progress. Your prompts are never shown — you just typed them. A
  skill's quest ends when you ask for something new (three words or more) with no task open.

It works with whatever skills you use. A skill's zone comes from its name and description:

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

## The Road

`/hud pane` opens the Road beside the transcript (docked in fullscreen from 110 columns,
inline above the prompt below that):

```
⚔ gku:implement · Forge — building and fixing        task 2/5
[the zone's scene: flags for your tasks, the avatar at the one in progress,
 subagents as ghosts behind it — it bobs while Claude works]
with Explore
✓ Read the exporter
✓ Add the CSV writer
▸ Write the CSV writer tests
· Wire it in
♥ ████████░░ 80%   ✦ █████░░░░░ 57%
— log —
19:04 skill gku:implement · Forge
19:05 scout read 3 files · 1 search
19:06 cast  csv.ts +4 -7
19:06 fork  Explore joined
```

The log is what Claude did, from what Claude Code reports: skills, reads and searches, edits
with lines added and removed, tasks done, plan mode, subagents joining and leaving, and
compaction. The scene moves only while Claude works and the pane is shown on a terminal; on the
desktop it stays still. A new session (`/clear`) starts the Road over.

**It costs nothing.** No model calls, nothing added to the context, no network. Every hook
only observes Claude Code's own events and passes them on unchanged, and nothing is written
into your project.

## Install

At the prompt of a Claude Code session:

```
/plugin install quest-hud --marketplace matasarei/quest-hud
```

Answer `y` to add the marketplace, then pick a scope. From a shell:
`claude plugin install quest-hud --marketplace matasarei/quest-hud`.

The repository is private for now: installing it needs access to it on GitHub, and GitHub
set up on your machine.

Requires Claude Code **2.1.316** or later, the version it is built and tested on. The mod API
is early access and may change between releases.

## Options

Set them in `/config`; a change reloads the mod.

| Option | Values | Default | What it does |
|---|---|---|---|
| `detail` | `off`, `status`, `band`, `pane` | `band` | nothing, one status-line entry, the band above the prompt, or the band and the Road opened when the session starts (placed from 144 columns) |
| `bars` | `hpmp`, `all` | `hpmp` | `all` adds the 5-hour window (⚡) and the session cost (◉) |
| `zones` | `name=zone, …` | empty | extra skill-to-zone rules, e.g. `quest=forge, triage=map` |

Zones: `watchtower`, `harbour`, `dungeon`, `arena`, `forge`, `map`, `camp`, `wilds`. A name
is a skill's full name (`gku:plan`) or the part after the plugin prefix (`plan`).

`/hud` prints the current state, what the zone means, and the task list. `/hud pane` opens the
Road at any width.

## Without mods

On a Claude Code without mods, `scripts/hud-line.sh` shows the HP and MP bars in the classic
status line:

```
♥▰▰▰▰▰▰▱▱▱▱ 62% ✦▰▰▰▰▰▰▱▱▱▱ 59%
```

In a session where the mod runs, `/hud statusline` prints both steps with the right path.
Otherwise, copy `plugins/quest-hud/scripts/hud-line.sh` from this repository to
`~/.claude/hud-line.sh`, and add to `~/.claude/settings.json`:

```json
"statusLine": { "type": "command", "command": "~/.claude/hud-line.sh" }
```

It needs `jq`. HP appears only on a Pro, Max or Ultra subscription; MP shows `—` until the
first response.

## Development

```bash
claude plugin validate . && claude plugin validate plugins/quest-hud
claude plugin test plugins/quest-hud
bash plugins/quest-hud/tests/hud-line.sh
shellcheck --severity=warning plugins/quest-hud/scripts/*.sh plugins/quest-hud/tests/*.sh
```

Run it from disk: `claude --plugin-dir plugins/quest-hud`; saving a file reloads the mod.

## License

MIT. See [LICENSE](LICENSE).
