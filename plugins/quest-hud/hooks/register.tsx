// Quest HUD: draws the session as a small game from Claude Code's own events.
// Every hook observes and passes the event on unchanged; nothing here calls a
// model or adds to the context.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { AVATAR_SMALL, MAGE, rasterSize, toRasterCells, toSvg } from '../src/avatar'
import { activeCompanions, sameCompanions } from '../src/companions'
import { appendEntry, castText, scoutCounts, scoutText } from '../src/log'
import { bandModel, fromMeasure, shortTokens, statusText, TONE_COLOR, ZONE_LABEL, zoneLine, type Bars } from '../src/meters'
import { afterPrompt, cleanTitle, fromSkill } from '../src/quest'
import { road, roadScene } from '../src/road'
import { applyTaskCall } from '../src/tasks'
import { parseZones, zoneFor } from '../src/zones'
import type { LogEntry } from '../types'
import { drawRoad, PANE_ID, PANE_TITLE, SCENE_KEY, sceneCells } from './pane'

// The values the HUD keeps for the session, each declared in types/index.d.ts.
// The engine lists what a module reads and writes from atoms defined in the
// file that uses them, so they live here; the pane draws from values passed in.
const sessionId = atom({ plugin: 'quest-hud', key: 'sessionId' } as const, null)
const quest = atom({ plugin: 'quest-hud', key: 'quest' } as const, null)
const tasks = atom({ plugin: 'quest-hud', key: 'tasks' } as const, [])
const meters = atom({ plugin: 'quest-hud', key: 'meters' } as const, null)
const log = atom({ plugin: 'quest-hud', key: 'log' } as const, [])
const companions = atom({ plugin: 'quest-hud', key: 'companions' } as const, [])
const activity = atom({ plugin: 'quest-hud', key: 'activity' } as const, null)
const isWorking = atom({ plugin: 'quest-hud', key: 'isWorking' } as const, false)

/** off, a status entry, the band, or the band and the Road pane opened at the start. */
type Detail = 'off' | 'status' | 'band' | 'pane'

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

// Prompts a person sent: typed, through Remote Control, or as the SDK's own turn.
// A background task's notification, a scheduled firing or another session's
// message never ends the quest.
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])

const TASK_TOOLS: ReadonlySet<string> = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite'])

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

/** Milliseconds between the bob's two frames. */
export const FRAME_MS = 500

// The scene's bob: one timer at most, running only while a main turn runs and
// the pane is shown on a terminal. `columns` and `surface` are where the pane
// was last drawn; a reload starts this over, and the engine drops its timers.
const bob: { timer?: Timer; frame: 0 | 1; columns?: number; surface?: string } = { frame: 0 }

const isPaneShown = async ($: EngineInterface): Promise<boolean> =>
  (await $.ui.panes()).some(pane => pane.id === PANE_ID && pane.isShown)

/** Repaints the scene's Raster with one frame, and stops the bob if nothing takes it. */
async function blitScene($: EngineInterface, frame: 0 | 1): Promise<void> {
  if (bob.columns === undefined) return

  const grid = roadScene({
    quest: await read($, quest),
    tasks: await read($, tasks),
    companions: await read($, companions),
    activity: await read($, activity),
    columns: bob.columns,
    frame,
  })
  const blitted = await $.ui.blit({ requestId: PANE_ID, key: SCENE_KEY, cells: sceneCells(grid) })

  if (blitted.deny !== undefined) stopTimer()
}

function stopTimer(): void {
  bob.timer?.cancel()
  bob.timer = undefined
  bob.frame = 0
}

/** One step of the bob: the other frame, while the pane is still shown. */
async function bobStep($: EngineInterface): Promise<void> {
  if (!(await isPaneShown($))) {
    stopTimer()
    return
  }

  // A stop while the panes were being asked wins: it has drawn the frame at rest.
  if (bob.timer === undefined) return

  bob.frame = bob.frame === 0 ? 1 : 0
  await blitScene($, bob.frame)
}

/** Starts the bob when the pane is shown on a terminal and none runs yet. */
async function startBob($: EngineInterface): Promise<void> {
  if (bob.timer !== undefined || bob.surface !== 'terminal' || !(await isPaneShown($))) return
  bob.timer = $.clock.every(FRAME_MS, () => void bobStep($))
}

/** Stops the bob and leaves the figures standing at rest. */
async function stopBob($: EngineInterface): Promise<void> {
  const wasRunning = bob.timer !== undefined
  stopTimer()
  if (wasRunning) await blitScene($, 0)
}

/** One more line in the pane's log, stamped with the time now. */
async function addLog($: EngineInterface, entry: Omit<LogEntry, 'at'>): Promise<void> {
  const at = await $.clock.now()
  await update($, log, entries => appendEntry(entries, { ...entry, at }))
}

/** Rereads the subagents at work and logs who joined and who left. */
async function refreshCompanions($: EngineInterface): Promise<void> {
  const now = activeCompanions(await $.agent.list())
  const before = await read($, companions)

  if (sameCompanions(before, now)) return

  await update($, companions, () => now)
  for (const joined of now.filter(c => !before.some(b => b.id === c.id))) await addLog($, { kind: 'fork', text: `${joined.type} joined` })
  for (const left of before.filter(b => !now.some(c => c.id === b.id))) await addLog($, { kind: 'fork', text: `${left.type} left` })
}

export const register: Register = (on, options) => {
  const detail = pick<Detail>(options.detail, ['off', 'status', 'band', 'pane'], 'band')
  const hasBand = detail === 'band' || detail === 'pane'
  const bars = pick<Bars>(options.bars, ['hpmp', 'all'], 'hpmp')
  const overrides = parseZones(typeof options.zones === 'string' ? options.zones : '')
  // Skills a subagent's Skill call is running right now, counted (two
  // subagents may run the same one): their skill.prompt fires inside that
  // call, and must not become the session's quest.
  const subagentSkills = new Map<string, number>()
  // The main loop's turn: reads and searches of one turn share a log line.
  let turn: string | undefined

  // State survives a reload, which runs session.start again with the same
  // session id: the quest in progress is kept. A new id (/clear, a resume of
  // another session) starts everything over.
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: 'Show the Quest HUD state; "/hud statusline" prints the fallback setup' })
    const id = await $.session.id()

    if ((await read($, sessionId)) !== id) {
      await update($, quest, () => null)
      await update($, tasks, () => [])
      await update($, log, () => [])
      await update($, companions, () => [])
      await update($, activity, () => null)
      await update($, sessionId, () => id)
    }

    // A start ends any turn the HUD thought was running, and its bob with it.
    await update($, isWorking, () => false)
    stopTimer()
    const usage = await $.session.usage()
    await update($, meters, () => fromMeasure(usage))
    await showStatus($, detail, bars)

    // Unasked, the engine places it only from 144 columns; below that it waits.
    if (detail === 'pane') {
      await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
    }

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

    if (subagentSkills.has(e.skill) || subagentSkills.has(name)) {
      await addLog($, { kind: 'fork', text: `a subagent ran ${cleanTitle(name)}` })
      return result
    }

    const description = typeof e.frontmatter.description === 'string' ? e.frontmatter.description : ''
    const now = await $.clock.now()
    const started = fromSkill(name, zoneFor(name, description, overrides), now)
    await update($, quest, () => started)
    await addLog($, { kind: 'skill', text: `${started.title} · ${ZONE_LABEL[started.zone]}` })
    await showStatus($, detail, bars)

    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const subagentSkill = e.tool === 'Skill' && e.agentId !== undefined ? e.skill : undefined

    if (subagentSkill !== undefined) subagentSkills.set(subagentSkill, (subagentSkills.get(subagentSkill) ?? 0) + 1)

    const ran = await next(e).finally(() => {
      if (subagentSkill === undefined) return
      const left = (subagentSkills.get(subagentSkill) ?? 1) - 1
      if (left > 0) subagentSkills.set(subagentSkill, left)
      else subagentSkills.delete(subagentSkill)
    })

    // A subagent's own calls stay out of the session's task list and log.
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) {
      return ran
    }

    if (TASK_TOOLS.has(e.tool)) {
      const before = await read($, tasks)
      await update($, tasks, list => {
        const changed = applyTaskCall(list, e.tool, e, ran.result)
        return changed === list ? list : [...changed]
      })

      if (e.tool === 'TaskUpdate' && e.status === 'completed') {
        const done = before.find(task => task.id === e.taskId && task.status !== 'completed')
        if (done) await addLog($, { kind: 'task', text: `✓ ${cleanTitle(done.subject)}` })
      }

      await showStatus($, detail, bars)
    }

    const counts = scoutCounts(e.tool)

    if (counts) {
      await addLog($, { kind: 'scout', text: scoutText(counts), counts, ...(turn === undefined ? {} : { turn }) })
      await update($, activity, () => 'map')
    }

    const cast = castText(e.tool, e, ran.result)

    if (cast !== undefined) {
      await addLog($, { kind: 'cast', text: cast, ...(turn === undefined ? {} : { turn }) })
      await update($, activity, () => 'forge')
    }

    if (e.tool === 'EnterPlanMode') {
      await addLog($, { kind: 'plan', text: 'entered' })
      await update($, activity, () => 'map')
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const started = await next(e)

    if (e.agentId === undefined) {
      turn = e.turnId
      await update($, isWorking, () => true)
      await startBob($)
    } else {
      await refreshCompanions($)
    }

    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)

    if (e.agentId === undefined) {
      await update($, isWorking, () => false)
      await stopBob($)
    }

    await refreshCompanions($)

    return completed
  }).catch(($, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)

    if (compacted.skip === undefined) {
      const { tokensBefore, tokensAfter } = compacted
      const text = tokensBefore !== undefined && tokensAfter !== undefined
        ? `${shortTokens(tokensBefore)} → ${shortTokens(tokensAfter)}`
        : 'context compacted'
      await addLog($, { kind: 'camp', text })
    }

    return compacted
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

    if (e.args.trim() === 'pane') {
      const opened = await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
      return { text: opened.isPlaced ? 'The Road is open.' : `The Road waits: ${opened.reason}` }
    }

    const current = await read($, quest)
    const list = await read($, tasks)
    const lines = [
      statusText(current, list, await read($, meters), 'all'),
      `  ${zoneLine(current?.zone ?? 'wilds')}`,
      ...list.map(task => `  ${task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▸' : '·'} ${cleanTitle(task.subject)}`),
    ]

    return { text: lines.join('\n') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)

    if (!hasBand || e.props.hasSurvey) {
      return below
    }

    const band = bandModel(await read($, quest), await read($, tasks), await read($, meters), bars, await $.clock.now())
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const hasRoom = e.props.maxRows >= AVATAR_SIZE.rows
    const row = (key: string, segments: typeof band.head) => (
      <Box key={key} flexDirection="row">
        {segments.map(segment => (
          <Text color={TONE_COLOR[segment.tone]} dimColor={segment.tone === 'dim'} wrap="truncate-end">
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

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE_ID) stopTimer()
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($, e) => {
    bob.columns = e.props.bodyColumns
    bob.surface = e.surface

    // A turn that began before the pane's first draw had no surface to bob on:
    // the draw starts it. startBob does nothing if a bob already runs.
    if (await read($, isWorking)) void startBob($)

    const view = road({
      quest: await read($, quest),
      tasks: await read($, tasks),
      meters: await read($, meters),
      log: await read($, log),
      companions: await read($, companions),
      activity: await read($, activity),
      bars,
      columns: e.props.bodyColumns,
      rows: e.viewport?.rows ?? 30,
      frame: 0,
    })

    return drawRoad($, e, view)
  })
}
