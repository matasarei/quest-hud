// The page's session: plain values and pure events. register.tsx does this over
// the engine's atoms, which cannot run here, so each event calls the same pure
// functions from the mod's src/ that the matching hook does. Only the wiring is
// this file's own: what it draws is all the mod's.
import { commandKinds, endFights, fightKinds, fightOutcome, fightText, forgeEvent, holdsTheRoad, lootText, NO_FOES, startFights } from '../../plugins/quest-hud/src/bash'
import { appendEntry, castText, scoutCounts, scoutText } from '../../plugins/quest-hud/src/log'
import { shortTokens, ZONE_LABEL, type Bars } from '../../plugins/quest-hud/src/meters'
import { cleanTitle, fromSkill } from '../../plugins/quest-hud/src/quest'
import { sceneZone } from '../../plugins/quest-hud/src/road'
import { applyTaskCall } from '../../plugins/quest-hud/src/tasks'
import type { Avatar } from '../../plugins/quest-hud/src/world/sprites'
import { atRest, nextMotion, REST, TRANSITION_STEPS, type Motion, type Transition } from '../../plugins/quest-hud/src/scene'
import { parseZones, zoneFor } from '../../plugins/quest-hud/src/zones'
import type { Allies, Board, Companion, FightKind, Foes, LevelCard, LogEntry, Meters, Quest, Task, Zone } from '../../plugins/quest-hud/types'

export type Detail = 'off' | 'status' | 'band' | 'pane'
export type Graphics = 'auto' | 'cells' | 'images'
export type Settings = Readonly<{ detail: Detail; bars: Bars; avatar: Avatar; graphics: Graphics; zones: string }>

export const WINDOW = 200_000
/** How long until the weekly window heals, as the sample shows it. */
const HEALS_MS = (2 * 24 + 4) * 3_600_000
const MAX_TRANSCRIPT = 200

export type Sim = Readonly<{
  settings: Settings
  /** Percent of the weekly limit left, and of the context window. */
  hp: number
  mp: number
  /** Percent of the 5-hour window used, and the session's cost in dollars. */
  five: number
  cost: number
  quest: Quest | null
  tasks: readonly Task[]
  log: readonly LogEntry[]
  companions: readonly Companion[]
  activity: Zone | null
  foes: Foes
  foesBefore: Foes
  loot: number
  allies: Allies
  isWorking: boolean
  /** What /quest-hud:off switched off. */
  isHidden: boolean
  isRoadOpen: boolean
  /** Whether /quest-hud:off closed the Road, so /quest-hud:on brings it back. */
  roadWasOpen: boolean
  isBoardOpen: boolean
  /** Which pane is in front, when both are open. */
  pane: 'road' | 'board'
  board: Board | null
  isTrivialOpen: boolean
  /** What /quest-hud:level last worked out. */
  level: LevelCard | null
  /** The session's text, oldest first. */
  transcript: readonly string[]
  nextId: number
  /** The visitor asked for less motion: no timer runs, and nothing walks or slides. */
  isStill: boolean
  /** How far the walk has got, and the frame count it steps by. */
  motion: Motion
  tick: number
  /** The zone last drawn. */
  zone: Zone
  /** A zone change under way, counted in frames. */
  slide?: { from: Zone; step: number }
}>

export const startSim = (settings: Settings, isStill = false): Sim => ({
  settings,
  isStill,
  motion: REST,
  tick: 0,
  zone: 'wilds',
  hp: 62,
  mp: 59,
  five: 34,
  cost: 1.84,
  quest: null,
  tasks: [],
  log: [],
  companions: [],
  activity: null,
  foes: NO_FOES,
  foesBefore: NO_FOES,
  loot: 0,
  allies: { octopus: false, fox: false },
  isWorking: false,
  isHidden: false,
  isRoadOpen: settings.detail === 'pane',
  roadWasOpen: false,
  isBoardOpen: false,
  pane: 'road',
  board: null,
  isTrivialOpen: false,
  level: null,
  transcript: [],
  nextId: 1,
})

/** The figures as `session.measure` would report them for these sliders. */
export const metersOf = (sim: Sim, now: number): Meters => {
  const used = 100 - sim.mp

  return {
    window: WINDOW,
    contextPercent: used,
    contextTokens: Math.round((used / 100) * WINDOW),
    weekUsed: 100 - sim.hp,
    weekResetsAt: new Date(now + HEALS_MS).toISOString(),
    fiveHourUsed: sim.five,
    costUsd: sim.cost,
  }
}

/** `noteZone`: a change of zone slides, where the Road is there to show it. */
const noteZone = (sim: Sim): Sim => {
  const zone = sceneZone(sim.quest, sim.activity)
  if (zone === sim.zone) return sim

  const { slide: _replaced, ...rest } = sim
  return sim.isStill || !isRoadShown(sim) ? { ...rest, zone } : { ...sim, zone, slide: { from: sim.zone, step: 0 } }
}

const addLog = (sim: Sim, entry: Omit<LogEntry, 'at'>, now: number): Sim => ({ ...sim, log: appendEntry(sim.log, { ...entry, at: now } as LogEntry) })

/** A line of the session's text. */
export const say = (sim: Sim, ...lines: readonly string[]): Sim => ({ ...sim, transcript: [...sim.transcript, ...lines].slice(-MAX_TRANSCRIPT) })

export const hasBand = (sim: Sim): boolean => !sim.isHidden && (sim.settings.detail === 'band' || sim.settings.detail === 'pane')

export const hasHint = (sim: Sim): boolean => !sim.isHidden && sim.settings.detail === 'status'

/** The Road is shown when it is open and not behind the board. */
export const isRoadShown = (sim: Sim): boolean => !sim.isHidden && sim.isRoadOpen && (sim.pane === 'road' || !sim.isBoardOpen)

export const isBoardShown = (sim: Sim): boolean => !sim.isHidden && sim.isBoardOpen && (sim.pane === 'board' || !sim.isRoadOpen)

/** A pane brought to the front, or closed. */
export const showPane = (sim: Sim, pane: Sim['pane']): Sim => ({ ...sim, pane })

export const closePane = (sim: Sim): Sim =>
  isBoardShown(sim) ? { ...sim, isBoardOpen: false, pane: 'road' } : { ...sim, isRoadOpen: false, pane: 'board' }

export const toggleTrivial = (sim: Sim): Sim => ({ ...sim, isTrivialOpen: !sim.isTrivialOpen })

/** A setting as a reloaded session takes it: `pane` opens the Road at the start, and the others start without it. */
export const withSetting = <K extends keyof Settings>(sim: Sim, name: K, value: Settings[K]): Sim => {
  const settings = { ...sim.settings, [name]: value }
  if (name === 'detail') return { ...sim, settings, isRoadOpen: value === 'pane' }
  if (name !== 'zones' || sim.quest === null) return { ...sim, settings }

  // The option is read as the skill starts: the running skill is placed as it would be now.
  return noteZone({ ...sim, settings, quest: { ...sim.quest, zone: zoneFor(sim.quest.skill, '', parseZones(String(value))) } })
}

const percent = (value: number): number => Math.min(100, Math.max(0, Math.round(value)))

export const withHp = (sim: Sim, value: number): Sim => ({ ...sim, hp: percent(value) })
export const withMp = (sim: Sim, value: number): Sim => ({ ...sim, mp: percent(value) })
export const withFive = (sim: Sim, value: number): Sim => ({ ...sim, five: percent(value) })
export const withCost = (sim: Sim, value: number): Sim => ({ ...sim, cost: Math.max(0, value) })

/** `skill.prompt`: the skill's quest, in the zone the rules and the `zones` option give it. */
export const startSkill = (sim: Sim, name: string, now: number, description = ''): Sim => {
  const started = fromSkill(name, zoneFor(name, description, parseZones(sim.settings.zones)), now)
  const next = addLog(noteZone({ ...sim, quest: started }), { kind: 'skill', text: `${started.title} · ${ZONE_LABEL[started.zone]}` }, now)

  return say(next, `> /${started.title}`)
}

/** The next prompt after a finished skill: the quest ends, and the road goes back to the Wilds or the last work. */
export const endSkill = (sim: Sim): Sim => noteZone({ ...sim, quest: null })

/** `turn.start` and `turn.complete`: when a turn ends, the figures come to rest where the walk got to. */
export const setWorking = (sim: Sim, isWorking: boolean): Sim => ({ ...sim, isWorking, motion: isWorking ? sim.motion : atRest(sim.motion) })

/** The animation's rule: only while a turn runs with the Road or the band to show it, or while the Road slides. */
export const needsTimer = (sim: Sim): boolean =>
  !sim.isStill && ((sim.isWorking && (isRoadShown(sim) || hasBand(sim))) || (sim.slide !== undefined && isRoadShown(sim)))

/** One frame of the animation: the walk steps while working, unless a monster holds the road, and a slide moves on. */
export const tickSim = (sim: Sim): Sim => {
  const walked = sim.isWorking
    ? { tick: sim.tick + 1, motion: nextMotion(sim.motion, sim.tick + 1, holdsTheRoad(sim.foes)) }
    : {}
  const step = (sim.slide?.step ?? 0) + 1
  const { slide: _ended, ...rest } = sim

  return sim.slide !== undefined && step < TRANSITION_STEPS
    ? { ...sim, ...walked, slide: { from: sim.slide.from, step } }
    : { ...rest, ...walked }
}

/** The zone change under way, as the scene takes it. */
export const transitionOf = (sim: Sim): { transition?: Transition } =>
  sim.slide === undefined ? {} : { transition: { from: sim.slide.from, progress: sim.slide.step / TRANSITION_STEPS } }

/** `TaskCreate`. */
export const addTask = (sim: Sim, subject: string): Sim => {
  const id = `t${sim.nextId}`
  const tasks = applyTaskCall(sim.tasks, 'TaskCreate', { subject, description: '' }, { task: { id, subject } })

  return { ...sim, tasks: [...tasks], nextId: sim.nextId + 1 }
}

/** `TaskUpdate`: the task in progress is done, logged, and the next open one begins. */
export const nextTask = (sim: Sim, now: number): Sim => {
  const current = sim.tasks.find(task => task.status === 'in_progress')
  const finished = current ? applyTaskCall(sim.tasks, 'TaskUpdate', { taskId: current.id, status: 'completed' }, { success: true }) : sim.tasks
  const open = finished.find(task => task.status === 'pending')
  const tasks = open ? applyTaskCall(finished, 'TaskUpdate', { taskId: open.id, status: 'in_progress' }, { success: true }) : finished
  const next: Sim = { ...sim, tasks: [...tasks] }

  return current ? addLog(next, { kind: 'task', text: `✓ ${cleanTitle(current.subject)}` }, now) : next
}

/** A Bash call starting: a test or lint run is a fight. */
export const bashStart = (sim: Sim, command: string): Sim => {
  const fights = fightKinds(commandKinds(command))

  return fights.length === 0 ? sim : { ...sim, foesBefore: sim.foes, foes: startFights(sim.foes, fights) }
}

/** A Bash call's end: the fight's outcome, the gh or glab ally, and a commit's loot, as `tool.call` takes them. */
export const bashEnd = (sim: Sim, command: string, stdout: string, isError: boolean, now: number): Sim => {
  const kinds = commandKinds(command)
  const fights = fightKinds(kinds)
  let next = sim

  if (fights.length > 0) {
    const outcome = fightOutcome(isError ? { isError: true, text: stdout } : { result: { stdout } })
    next = { ...next, foes: endFights(next.foes, fights, outcome, next.foesBefore) }
    if (outcome.result !== 'none') next = addLog(next, { kind: 'fight', text: fightText(fights, outcome) }, now)
  }

  for (const kind of kinds) {
    if (kind !== 'gh' && kind !== 'glab') continue
    next = { ...next, allies: { ...next.allies, [kind === 'gh' ? 'octopus' : 'fox']: true } }
    const event = forgeEvent(kind, command, !isError, stdout)
    if (event !== undefined) next = addLog(next, { kind: 'ally', text: event }, now)
  }

  if (!isError && kinds.includes('commit')) {
    next = addLog({ ...next, loot: next.loot + 1 }, { kind: 'loot', text: lootText(stdout) }, now)
  }

  return next
}

/** A run stopped before it answered: `tool.call`'s no-outcome path, so the monsters go back to what they were. */
export const interruptFights = (sim: Sim): Sim => {
  const fights = (Object.keys(sim.foes) as FightKind[]).filter(kind => sim.foes[kind] === 'fighting')

  return fights.length === 0 ? sim : { ...sim, foes: endFights(sim.foes, fights, { result: 'none' }, sim.foesBefore) }
}

/** A read or an edit: the log, and what work the Wilds show when no skill runs. */
export const toolCall = (sim: Sim, tool: string, input: unknown, result: unknown, now: number): Sim => {
  const counts = scoutCounts(tool)
  if (counts) return noteZone(addLog({ ...sim, activity: 'map' }, { kind: 'scout', text: scoutText(counts), counts }, now))

  const cast = castText(tool, input, result)
  return cast === undefined ? sim : noteZone(addLog({ ...sim, activity: 'forge' }, { kind: 'cast', text: cast }, now))
}

/** A subagent joins, and appears as a ghost behind the wizard. */
export const addCompanion = (sim: Sim, type: string): Sim => ({
  ...sim,
  companions: [...sim.companions, { id: `a${sim.nextId}`, type: cleanTitle(type) }],
  nextId: sim.nextId + 1,
})

/** The oldest subagent is done. */
export const dropCompanion = (sim: Sim): Sim => ({ ...sim, companions: sim.companions.slice(1) })

/** `session.compact`: the context falls to this percent used, and the camp is logged. */
export const compact = (sim: Sim, percentUsedAfter: number, now: number): Sim => {
  const before = Math.round(((100 - sim.mp) / 100) * WINDOW)
  const after = Math.round((percentUsedAfter / 100) * WINDOW)

  return addLog({ ...sim, mp: percent(100 - percentUsedAfter) }, { kind: 'camp', text: `${shortTokens(before)} → ${shortTokens(after)}` }, now)
}

/** Where the page opens: part way through a skill, with something to look at. */
export const exampleSession = (settings: Settings, now: number, isStill = false): Sim => {
  let sim = startSim(settings, isStill)
  sim = startSkill(sim, 'gku:implement', now)
  sim = addTask(sim, 'Read the exporter')
  sim = addTask(sim, 'Write the CSV writer tests')
  sim = addTask(sim, 'Wire it in')
  sim = nextTask(sim, now)
  sim = nextTask(sim, now)
  const { slide: _noSlideOnLoad, ...settled } = say(sim, 'Reading the exporter, then writing its tests first.')

  return settled
}
