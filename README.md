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
plan → Map room, implement/fix → Forge, review/verify/test → Arena, pr/mr → Harbour,
audit → Dungeon, init → Camp, and the Wilds for anything else.

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
| `detail` | `off`, `status`, `band` | `band` | nothing, one status-line entry, or the band above the prompt |
| `bars` | `hpmp`, `all` | `hpmp` | `all` adds the 5-hour window (⚡) and the session cost (◉) |
| `zones` | `name=zone, …` | empty | extra skill-to-zone rules, e.g. `quest=forge, triage=map` |

Zones: `watchtower`, `harbour`, `dungeon`, `arena`, `forge`, `map`, `camp`, `wilds`. A name
is a skill's full name (`gku:plan`) or the part after the plugin prefix (`plan`).

`/hud` prints the current state and the task list.

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
