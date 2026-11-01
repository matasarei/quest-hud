// Quest HUD: draws the session as a small game from Claude Code's own events.
// Every hook observes and passes the event on unchanged; nothing here calls a
// model or adds to the context.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { AVATAR_SMALL, MAGE, rasterSize, toRasterCells, toSvg } from '../src/avatar'
import { bandModel, fromMeasure, statusText, type Bars, type Tone } from '../src/meters'
import { afterPrompt, cleanTitle, fromSkill } from '../src/quest'
import { applyTaskCall } from '../src/tasks'
import { parseZones, zoneFor } from '../src/zones'

const quest = atom({ plugin: 'quest-hud', key: 'quest' } as const, null)
const tasks = atom({ plugin: 'quest-hud', key: 'tasks' } as const, [])
const meters = atom({ plugin: 'quest-hud', key: 'meters' } as const, null)

type Detail = 'off' | 'status' | 'band'

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

// Prompts a person sent: typed, through Remote Control, or as the SDK's own turn.
// A background task's notification, a scheduled firing or another session's
// message never ends the quest.
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])

const TASK_TOOLS: ReadonlySet<string> = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite'])

const COLOR: Readonly<Record<Tone, string | undefined>> = {
  accent: '#c3a6ff',
  plain: undefined,
  dim: undefined,
  hp: '#4fd37a',
  mp: '#5b9bff',
  five: '#f0b43a',
  gold: '#f2d15b',
}

const AVATAR_CELLS = toRasterCells(AVATAR_SMALL, MAGE)
const AVATAR_SVG = toSvg(AVATAR_SMALL, MAGE)
const AVATAR_SIZE = rasterSize(AVATAR_SMALL)

/** A plugin's skill reads `plugin:name`, whichever way the engine passes it. */
const skillName = (skill: string, pluginName: string | undefined): string =>
  pluginName && !skill.includes(':') ? `${pluginName}:${skill}` : skill

const help = (root: string): string =>
  [
    'Quest HUD, for sessions where mods do not run: a status-line script with the HP and MP bars.',
    'Copy it where an update cannot move it, then add the setting to ~/.claude/settings.json:',
    '',
    `  cp "${root}/scripts/hud-line.sh" ~/.claude/hud-line.sh`,
    '',
    '  "statusLine": { "type": "command", "command": "~/.claude/hud-line.sh" }',
    '',
    'It needs jq.',
  ].join('\n')

/** The one-line entry, drawn only when the detail option asks for it. */
async function showStatus($: EngineInterface, detail: Detail, bars: Bars): Promise<void> {
  if (detail === 'status') {
    $.ui.status(statusText(await read($, quest), await read($, tasks), await read($, meters), bars))
  }
}

export const register: Register = (on, options) => {
  const detail = pick<Detail>(options.detail, ['off', 'status', 'band'], 'band')
  const bars = pick<Bars>(options.bars, ['hpmp', 'all'], 'hpmp')
  const overrides = parseZones(typeof options.zones === 'string' ? options.zones : '')

  // State lives in $.state for the session and survives a reload, so a start
  // does not reset it: a reload must not wipe the quest in progress.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: 'Show the Quest HUD state; "/hud statusline" prints the fallback setup' })
    const usage = await $.session.usage()
    await update($, meters, () => fromMeasure(usage))
    await showStatus($, detail, bars)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta !== true && PERSON_ORIGINS.has(e.origin.kind)) {
      const list = await read($, tasks)
      await update($, quest, current => afterPrompt(current, e.text, list))
      await showStatus($, detail, bars)
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('skill.prompt', async ($, e, next) => {
    const result = await next(e)
    const name = skillName(e.skill, e.pluginName)
    const description = typeof e.frontmatter.description === 'string' ? e.frontmatter.description : ''
    const now = await $.clock.now()
    await update($, quest, () => fromSkill(name, zoneFor(name, description, overrides), now))
    await showStatus($, detail, bars)

    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const ran = await next(e)

    if (TASK_TOOLS.has(e.tool) && e.agentId === undefined && ran.deny === undefined && ran.isError !== true) {
      await update($, tasks, list => {
        const changed = applyTaskCall(list, e.tool, e, ran.result)
        return changed === list ? list : [...changed]
      })
      await showStatus($, detail, bars)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    await update($, meters, () => fromMeasure(e))
    await showStatus($, detail, bars)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'hud' }, async ($, e) => {
    if (e.args.trim() === 'statusline') {
      return { text: help($.plugin.root) }
    }

    const current = await read($, quest)
    const list = await read($, tasks)
    const lines = [
      statusText(current, list, await read($, meters), 'all'),
      ...list.map(task => `  ${task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▸' : '·'} ${cleanTitle(task.subject)}`),
    ]

    return { text: lines.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)

    if (detail !== 'band' || e.props.hasSurvey) {
      return below
    }

    const band = bandModel(await read($, quest), await read($, tasks), await read($, meters), bars, await $.clock.now())
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const hasRoom = e.props.maxRows >= AVATAR_SIZE.rows
    const row = (key: string, segments: typeof band.head) => (
      <Box key={key} flexDirection="row">
        {segments.map(segment => (
          <Text color={COLOR[segment.tone]} dimColor={segment.tone === 'dim'} wrap="truncate-end">
            {segment.text}
          </Text>
        ))}
      </Box>
    )
    // resolve() names every element on every surface, and one a surface lacks
    // draws as an empty fragment: the surface decides, not the table.
    const avatar = !hasRoom
      ? null
      : e.surface === 'terminal' && 'Raster' in elements
        ? <elements.Raster key="avatar" columns={AVATAR_SIZE.columns} rows={AVATAR_SIZE.rows} cells={AVATAR_CELLS} />
        : 'Svg' in elements
          ? <elements.Svg source={AVATAR_SVG} alt="avatar" width={24} height={24} />
          : null

    return (
      <Box flexDirection="column">
        <Box key="band" flexDirection="row" gap={1} alignItems="center">
          {avatar}
          <Box flexDirection="column">
            {row('head', band.head)}
            {row('meters', band.meters)}
          </Box>
        </Box>
        {below}
      </Box>
    )
  })
}
