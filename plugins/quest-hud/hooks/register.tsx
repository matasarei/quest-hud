// Quest HUD: draws the session as a small game from Claude Code's own events.
// Every hook observes and passes the event on unchanged; nothing here calls a
// model or adds to the context.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { gridToSvg } from '../src/avatar'
import { commandKinds, endFights, fightKinds, fightOutcome, fightText, forgeEvent, holdsTheRoad, lootText, NO_FOES, startFights, stdoutOf } from '../src/bash'
import { activeCompanions, sameCompanions } from '../src/companions'
import { asCard, cardOf, type Inventory } from '../src/harness'
import { unknownText, usageText } from '../src/help'
import { levelLogText, levelText, levelUpText, NO_LEVEL_YET, rereadingText, scoutRidesText, STILL_READING } from '../src/levelup'
import { appendEntry, castText, scoutCounts, scoutText } from '../src/log'
import { bandModel, fromMeasure, hintText, shortTokens, statusText, TONE_COLOR, ZONE_LABEL, zoneLine, type Bars } from '../src/meters'
import { downsample } from '../src/paint/pixels'
import { afterPrompt, cleanTitle, fromSkill } from '../src/quest'
import { road, roadArt, SCENE_MIN_COLUMNS, sceneZone } from '../src/road'
import { atRest, BAND, bandPortrait, nextMotion, REST, TRANSITION_STEPS, type Motion, type Transition } from '../src/scene'
import { asSurvey, changedFiles, mergeSurvey, talliesOf, usageFrom, type History, type Surveyed, type Transcript } from '../src/survey'
import { applyTaskCall } from '../src/tasks'
import { ART_SCALE } from '../src/world/sprites'
import { parseZones, zoneFor } from '../src/zones'
import type { Allies, FightKind, Foes, LevelCard, LogEntry, Meters, Usage, Zone } from '../types'
import { artCells, drawRoad, PANE_ID, PANE_TITLE, SCENE_IMAGE_KEY, SCENE_KEY, sceneImage, type PngSource, type SceneMode } from './pane'
import { configDir, readHistory, readInventory, readProjects, scanTranscripts } from './survey'

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
const imagesWork = atom({ plugin: 'quest-hud', key: 'imagesWork' } as const, null)
const foes = atom({ plugin: 'quest-hud', key: 'foes' } as const, NO_FOES)
const loot = atom({ plugin: 'quest-hud', key: 'loot' } as const, 0)
const NO_ALLIES: Allies = { octopus: false, fox: false }
const allies = atom({ plugin: 'quest-hud', key: 'allies' } as const, NO_ALLIES)
const hidden = atom({ plugin: 'quest-hud', key: 'hidden' } as const, false)
const level = atom({ plugin: 'quest-hud', key: 'level' } as const, null)

/** off, the bars on the hint line, the band, or the band and the Road pane opened at the start. */
type Detail = 'off' | 'status' | 'band' | 'pane'
/** How the terminal's scene is drawn: found out (`auto`), or forced. */
type Graphics = 'auto' | 'cells' | 'images'

const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback

// Prompts a person sent: typed, through Remote Control, or as the SDK's own turn.
// A background task's notification, a scheduled firing or another session's
// message never ends the quest.
const PERSON_ORIGINS: ReadonlySet<string> = new Set(['composer', 'bridge', 'sdk'])

const TASK_TOOLS: ReadonlySet<string> = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite'])

/** The band portrait's key, which $.ui.blit names to step it with the animation. */
const BAND_KEY = 'avatar'

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

/** What /quest-hud:pane answers: it opens the Road, at any width. */
async function openRoad($: EngineInterface): Promise<string> {
  if (await read($, hidden)) return 'Quest HUD is off. /quest-hud:on brings it back.'

  const opened = await $.ui.open({ id: PANE_ID, title: PANE_TITLE })

  return opened.isPlaced ? 'The Road is open.' : `The Road waits: ${opened.reason}`
}

/**
 * The session's figures as last measured. A /clear wipes the host's state, and
 * neither session.start nor session.measure follows it, so until a unit moves
 * the engine's plain usage call, which costs nothing, is what still has them.
 */
async function currentMeters($: EngineInterface): Promise<Meters> {
  return (await read($, meters)) ?? fromMeasure(await $.session.usage())
}

/** What /quest-hud:status answers: the quest, what its zone means, the tasks. */
async function statusLines($: EngineInterface): Promise<string> {
  const current = await read($, quest)
  const list = await read($, tasks)

  return [
    statusText(current, list, await currentMeters($), 'all'),
    `  ${zoneLine(current?.zone ?? 'wilds')}`,
    ...list.map(task => `  ${task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▸' : '·'} ${cleanTitle(task.subject)}`),
  ].join('\n')
}

/** Milliseconds between the animation's frames: four a second, slow and stepped, as a terminal animates. */
export const ANIM_MS = 250

// The scene's animation: one timer at most, running only while a main turn
// runs and the pane's scene is drawn in a terminal, as cells or as an image.
// `tick` counts its frames, `motion` is where the walk got to; `columns` and
// `mode` are how the pane was last drawn. A reload starts this over, and the
// engine drops its timers.
// `zone` is the zone last drawn, and `slide` a zone change under way, counted in frames.
const anim: {
  timer?: Timer
  isStarting: boolean
  generation: number
  tick: number
  motion: Motion
  columns?: number
  mode?: SceneMode
  zone?: Zone
  slide?: { from: Zone; step: number }
  /** The band's draw, when its portrait is a Raster the animation can step too. */
  band?: string
} = {
  isStarting: false,
  generation: 0,
  tick: 0,
  motion: REST,
}

/** Milliseconds after an image's first draw before the probe blits it back. */
export const PROBE_MS = 100

// The probe that learns whether images draw here: at most one waiting at a
// time. A new session cancels its timer and moves the generation on, so a
// probe from the session before writes nothing, fired or not.
const probe: { isPending: boolean; generation: number; timer?: Timer } = { isPending: false, generation: 0 }

/** Forgets any probe of the session that is ending: its timer is cancelled, its answer ignored. */
function resetProbe(): void {
  probe.timer?.cancel()
  probe.timer = undefined
  probe.isPending = false
  probe.generation += 1
}

/**
 * Blits the drawn image back, the same source: the engine takes it where the
 * terminal shows images, and refuses it where it drew the image's alt instead.
 * Either answer is written for the session; a blit that throws counts as a
 * refusal, as an image the engine cannot place is no image either.
 */
async function probeImages($: EngineInterface, source: PngSource, generation: number): Promise<void> {
  let works = false

  try {
    works = (await $.ui.blit({ requestId: PANE_ID, key: SCENE_IMAGE_KEY, source })).deny === undefined
  } catch {
    works = false
  }

  // A new session started while this probe was waiting: its answer is not that session's.
  if (probe.generation !== generation) return

  probe.isPending = false
  probe.timer = undefined
  await update($, imagesWork, () => works)
}

const isPaneShown = async ($: EngineInterface): Promise<boolean> =>
  (await $.ui.panes()).some(pane => pane.id === PANE_ID && pane.isShown)

/** The zone change under way, as the scene takes it: none, or the old zone and how far the slide has gone. */
const transition = (): { transition?: Transition } =>
  anim.slide === undefined ? {} : { transition: { from: anim.slide.from, progress: anim.slide.step / TRANSITION_STEPS } }

/** Repaints the scene with the animation's frame — the Raster's cells, or the Image's picture — and stops it if nothing takes it. */
async function blitFrame($: EngineInterface): Promise<void> {
  if (anim.columns === undefined || (anim.mode !== 'raster' && anim.mode !== 'image')) return

  const art = roadArt({
    quest: await read($, quest),
    tasks: await read($, tasks),
    companions: await read($, companions),
    activity: await read($, activity),
    foes: await read($, foes),
    loot: await read($, loot),
    allies: await read($, allies),
    columns: anim.columns,
    motion: anim.motion,
    ...transition(),
    cells: anim.mode === 'raster',
  })
  const blitted = anim.mode === 'image'
    ? await $.ui.blit({ requestId: PANE_ID, key: SCENE_IMAGE_KEY, source: sceneImage(art) })
    : await $.ui.blit({ requestId: PANE_ID, key: SCENE_KEY, cells: artCells(art) })

  if (blitted.deny !== undefined) stopTimer()

  // The band's wizard steps with the Road's; a band no longer drawn just stops taking frames.
  if (anim.band !== undefined) {
    const band = await $.ui.blit({ requestId: anim.band, key: BAND_KEY, cells: artCells(bandPortrait(anim.motion.pose)) })
    if (band.deny !== undefined) anim.band = undefined
  }
}

/** Cancels the animation, and any start still waiting to make its timer; the figures come to rest where the walk got to. */
function stopTimer(): void {
  anim.generation += 1
  anim.timer?.cancel()
  anim.timer = undefined
  anim.motion = atRest(anim.motion)
  anim.slide = undefined
}

/** One frame of the animation, while the pane is still shown: a step of the walk, or a blow while a fight is on. */
async function animStep($: EngineInterface): Promise<void> {
  if (!(await isPaneShown($))) {
    stopTimer()
    return
  }

  // A stop while the panes were being asked wins: it has drawn the frame at rest.
  if (anim.timer === undefined) return

  // While Claude works the wizard walks, unless a monster blocks the Road — fought, or
  // standing after a lost run: then he holds his ground, striking at it. A zone change
  // slides on either way.
  const isWalking = await read($, isWorking)
  if (isWalking) {
    anim.tick += 1
    anim.motion = nextMotion(anim.motion, anim.tick, holdsTheRoad(await read($, foes)))
  }
  if (anim.slide !== undefined) anim.slide = { ...anim.slide, step: anim.slide.step + 1 }
  await blitFrame($)

  // The slide's last frame is the new zone: done, and with Claude idle, so is the timer.
  if (anim.slide !== undefined && anim.slide.step >= TRANSITION_STEPS) {
    anim.slide = undefined
    if (!isWalking) stopTimer()
  }
}

/**
 * Starts the slide to a new zone when the scene's zone changed since it was
 * last drawn, and the pane animates; the timer runs for it, idle or not.
 */
async function noteZone($: EngineInterface): Promise<void> {
  const zone = sceneZone(await read($, quest), await read($, activity))
  const before = anim.zone
  anim.zone = zone
  if (before === undefined || before === zone || (anim.mode !== 'raster' && anim.mode !== 'image')) return
  anim.slide = { from: before, step: 0 }
  await startAnim($)
  // No timer could start (the pane is hidden): no slide either, or the next draw would show it stuck at the old zone.
  if (anim.timer === undefined) anim.slide = undefined
}

/**
 * Starts the animation when the pane's scene is drawn in a terminal (cells or
 * an image) and shown, and none runs yet; the desktop's Svg stays still.
 * Two paths call it (a main turn's start, and a draw while a turn runs), and
 * either can meet a stop across the await. The slot is claimed before it, so
 * a second start returns; and a stop during it (turn.complete, a session
 * start, a close) moves the generation on, so this start makes no timer.
 */
async function startAnim($: EngineInterface): Promise<void> {
  if (anim.timer !== undefined || anim.isStarting || (anim.mode !== 'raster' && anim.mode !== 'image')) return
  anim.isStarting = true
  const generation = anim.generation

  try {
    const isShown = await isPaneShown($)

    if (isShown && anim.timer === undefined && anim.generation === generation) {
      anim.timer = $.clock.every(ANIM_MS, () => void animStep($))
    }
  } finally {
    anim.isStarting = false
  }
}

/** Stops the animation and leaves the figures standing at rest. */
async function stopAnim($: EngineInterface): Promise<void> {
  const wasRunning = anim.timer !== undefined
  stopTimer()
  if (wasRunning) await blitFrame($)
}

/** What /quest-hud:off answers: stored, so it holds in every session; the hooks go on observing, and only the drawing stops. */
async function turnOff($: EngineInterface): Promise<string> {
  if (await read($, hidden)) return 'Quest HUD is already off.'

  const wasOpen = (await $.ui.panes()).some(pane => pane.id === PANE_ID)
  await $.store.set('hidden', true)
  await $.store.set('roadWasOpen', wasOpen)
  await update($, hidden, () => true)
  stopTimer()
  await $.ui.close({ id: PANE_ID })

  return 'Quest HUD is off, in every session. /quest-hud:on brings it back.'
}

/** What /quest-hud:on answers: the HUD as it was, with the Road back if off closed it or the detail option asks for it. */
async function turnOn($: EngineInterface, detail: Detail): Promise<string> {
  if (!(await read($, hidden))) return 'Quest HUD is already on.'

  const wasOpen = (await $.store.get('roadWasOpen')) === true
  await $.store.set('hidden', false)
  await $.store.delete('roadWasOpen')
  await update($, hidden, () => false)
  if (wasOpen || detail === 'pane') await $.ui.open({ id: PANE_ID, title: PANE_TITLE })

  return detail === 'off' ? 'Quest HUD is on, but the detail option is off: /plugin configure quest-hud@quest-hud changes it.' : 'Quest HUD is back.'
}

/** One reading of the transcripts at a time; a reload starts this over, and the engine ends its child. */
const reading: { isRunning: boolean } = { isRunning: false }

/** The level as last worked out: a /clear wipes the atom and no start follows, so the store still has it. */
async function currentLevel($: EngineInterface): Promise<LevelCard | null> {
  return (await read($, level)) ?? asCard(await $.store.get('level'))
}

/** What the sessions came to, from the cache: the transcripts' tallies and the prompt history. */
function usageOf(survey: Readonly<Record<string, Surveyed>>, files: readonly Transcript[], history: History, inventory: Inventory, now: number): Usage {
  const read = files.filter(file => survey[file.name] !== undefined).map(file => file.mtimeMs)
  return usageFrom(talliesOf(survey), history, inventory.skills, now, read.length > 0 ? Math.min(...read) : undefined)
}

/** Keeps the card, then shows it: a /clear between the two loses nothing. Answers whether the store took it. */
async function keepCard($: EngineInterface, card: LevelCard): Promise<boolean> {
  const isKept = await $.store.set('level', card).then(() => true, () => false)
  await update($, level, () => card)
  return isKept
}

/**
 * Reads the changed transcripts in the background and keeps what they came to.
 * A grep that cannot start reads as nothing found, so the card says usage
 * unread; the log carries the level when it first arrives or moves, and says when
 * a session could not be read or the result kept, as the next run then reads it again.
 */
async function readSessions($: EngineInterface, files: readonly Transcript[], changed: readonly Transcript[], cached: Readonly<Record<string, Surveyed>>, history: History, inventory: Inventory): Promise<void> {
  const before = await currentLevel($)
  const { tallies, unread } = await scanTranscripts($, changed)
  const survey = mergeSurvey(cached, files, changed.filter(file => !unread.includes(file)), tallies)
  const card = cardOf(inventory, usageOf(survey, files, history, inventory, await $.clock.now()))
  const isCardKept = await keepCard($, card)
  const isSurveyKept = await $.store.set('survey', survey).then(() => true, () => false)
  const isKept = isCardKept && isSurveyKept

  if (before?.level !== card.level || !isKept || unread.length > 0) await addLog($, { kind: 'level', text: levelLogText(card, isKept, unread.length) })
}

/**
 * What /quest-hud:level answers, at once: the parts from a fresh look at the
 * setup and the tallies kept so far, while changed transcripts are read in the
 * background. The only place transcripts are read: never at a start, never on a timer.
 */
async function levelCommand($: EngineInterface): Promise<string> {
  const config = await configDir($)
  const history = await readHistory($, config)
  const { transcripts, ...notes } = await readProjects($, config)
  const inventory = await readInventory($, config, history, notes)
  const kept = asSurvey(await $.store.get('survey'))
  // Sessions the retention sweep took leave the count, whether or not anything else changed.
  const cached = mergeSurvey(kept, transcripts, [], {})
  const changed = changedFiles(transcripts, cached)
  const hasLevel = (await currentLevel($)) !== null
  const scout = scoutRidesText(changed.length, changed.reduce((sum, file) => sum + file.size, 0))
  const card = cardOf(inventory, usageOf(cached, transcripts, history, inventory, await $.clock.now()))

  if (reading.isRunning) return hasLevel ? `${levelText(card)}\n${STILL_READING}` : STILL_READING

  if (changed.length > 0) {
    reading.isRunning = true
    // This card goes first, so the reading's lands on top of it. On a first run there is none to show yet.
    void (hasLevel ? keepCard($, card) : Promise.resolve(true))
      .then(() => readSessions($, transcripts, changed, cached, history, inventory))
      .catch(() => undefined)
      .finally(() => {
        reading.isRunning = false
      })

    return hasLevel ? `${levelText(card)}\n${rereadingText(changed.length)}` : scout
  }

  if (Object.keys(cached).length !== Object.keys(kept).length) await $.store.set('survey', cached).catch(() => undefined)

  await keepCard($, card)

  return levelText(card)
}

/** What /quest-hud:level-up answers: quests from the usage last read and a fresh look at the setup. No transcript is read. */
async function levelUpCommand($: EngineInterface): Promise<string> {
  const kept = await currentLevel($)
  if (kept === null) return NO_LEVEL_YET

  const config = await configDir($)
  const history = await readHistory($, config)
  const { transcripts: _, ...notes } = await readProjects($, config)
  const inventory = await readInventory($, config, history, notes)
  const card = cardOf(inventory, kept.usage)
  await keepCard($, card)

  return levelUpText(card, inventory)
}

/** One more line in the pane's log, stamped with the time now. */
async function addLog($: EngineInterface, entry: Omit<LogEntry, 'at'>): Promise<void> {
  const at = await $.clock.now()
  await update($, log, entries => appendEntry(entries, { ...entry, at }))
}

/**
 * Ends the fights a Bash call started: the monsters go, stay standing, or go
 * back to what they were when the run had no outcome; a fight with one is
 * logged, led by the subagent that fought it.
 */
async function endFight($: EngineInterface, kinds: readonly FightKind[], before: Foes, ran: Parameters<typeof fightOutcome>[0], agentId: string | undefined): Promise<void> {
  const outcome = fightOutcome(ran)
  await update($, foes, now => endFights(now, kinds, outcome, before))
  if (outcome.result === 'none') return

  const who = agentId === undefined ? undefined : ((await read($, companions)).find(c => c.id === agentId)?.type ?? 'subagent')
  await addLog($, { kind: 'fight', text: fightText(kinds, outcome, who) })
}

/** A Bash call's gh or glab part: brings its character, and logs what it did to a PR or MR. */
async function forgeCall($: EngineInterface, command: string, ok: boolean, stdout: string): Promise<void> {
  for (const kind of commandKinds(command)) {
    if (kind !== 'gh' && kind !== 'glab') continue
    const ally = kind === 'gh' ? 'octopus' : 'fox'
    await update($, allies, now => (now[ally] ? now : { ...now, [ally]: true }))
    const event = forgeEvent(kind, command, ok, stdout)
    if (event !== undefined) await addLog($, { kind: 'ally', text: event })
  }
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
  const graphics = pick<Graphics>(options.graphics, ['auto', 'cells', 'images'], 'auto')
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
    await $.command.register({ name: 'quest-hud', description: "List Quest HUD's commands and its options" })
    const isHidden = (await $.store.get('hidden')) === true
    await update($, hidden, () => isHidden)
    const kept = asCard(await $.store.get('level'))
    await update($, level, () => kept)
    const id = await $.session.id()

    if ((await read($, sessionId)) !== id) {
      await update($, quest, () => null)
      await update($, tasks, () => [])
      await update($, log, () => [])
      await update($, companions, () => [])
      await update($, activity, () => null)
      await update($, imagesWork, () => null)
      await update($, foes, () => NO_FOES)
      await update($, loot, () => 0)
      await update($, allies, () => NO_ALLIES)
      anim.tick = 0
      anim.motion = REST
      anim.zone = undefined
      resetProbe()
      await update($, sessionId, () => id)
    }

    // A start ends any turn the HUD thought was running, and its animation with it.
    await update($, isWorking, () => false)
    stopTimer()
    const usage = await $.session.usage()
    await update($, meters, () => fromMeasure(usage))

    // Unasked, the engine places it only from 144 columns; below that it waits.
    if (detail === 'pane' && !isHidden) {
      await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    if (e.isMeta !== true && PERSON_ORIGINS.has(e.origin.kind)) {
      const list = await read($, tasks)
      await update($, quest, current => afterPrompt(current, e.text, list))
      await noteZone($)
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
    await noteZone($)
    await addLog($, { kind: 'skill', text: `${started.title} · ${ZONE_LABEL[started.zone]}` })

    return result
  }).catch(($, e, next) => next(e))

  on('tool.call', async ($, e, next) => {
    const subagentSkill = e.tool === 'Skill' && e.agentId !== undefined ? e.skill : undefined
    // A test or lint run is a fight, a subagent's too; one sent to the background has no outcome to show.
    const fights = e.tool === 'Bash' && e.run_in_background !== true ? fightKinds(commandKinds(e.command)) : []
    const before = fights.length > 0 ? await read($, foes) : NO_FOES

    if (subagentSkill !== undefined) subagentSkills.set(subagentSkill, (subagentSkills.get(subagentSkill) ?? 0) + 1)
    if (fights.length > 0) await update($, foes, now => startFights(now, fights))

    const ran = await next(e)
      .catch(async (error: unknown) => {
        if (fights.length > 0) await update($, foes, now => endFights(now, fights, { result: 'none' }, before))
        throw error
      })
      .finally(() => {
        if (subagentSkill === undefined) return
        const left = (subagentSkills.get(subagentSkill) ?? 1) - 1
        if (left > 0) subagentSkills.set(subagentSkill, left)
        else subagentSkills.delete(subagentSkill)
      })

    if (fights.length > 0) await endFight($, fights, before, ran, e.agentId)

    // gh brings the octopus and glab the fox, whatever the call; a change to a
    // PR or MR is logged, and failed checks too, so this comes before the error return.
    if (e.tool === 'Bash' && e.agentId === undefined && ran.deny === undefined) {
      await forgeCall($, e.command, ran.isError !== true, stdoutOf(ran.result))
    }

    // A subagent's own calls stay out of the session's task list and log.
    if (e.agentId !== undefined || ran.deny !== undefined || ran.isError === true) {
      return ran
    }

    // A commit the session made drops loot; a refused one (a hook said no) is an error, so none.
    if (e.tool === 'Bash' && e.run_in_background !== true && commandKinds(e.command).includes('commit')) {
      await update($, loot, count => count + 1)
      await addLog($, { kind: 'loot', text: lootText(stdoutOf(ran.result)) })
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
    }

    const counts = scoutCounts(e.tool)

    if (counts) {
      await addLog($, { kind: 'scout', text: scoutText(counts), counts, ...(turn === undefined ? {} : { turn }) })
      await update($, activity, () => 'map')
      await noteZone($)
    }

    const cast = castText(e.tool, e, ran.result)

    if (cast !== undefined) {
      await addLog($, { kind: 'cast', text: cast, ...(turn === undefined ? {} : { turn }) })
      await update($, activity, () => 'forge')
      await noteZone($)
    }

    if (e.tool === 'EnterPlanMode') {
      await addLog($, { kind: 'plan', text: 'entered' })
      await update($, activity, () => 'map')
      await noteZone($)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    const started = await next(e)

    if (e.agentId === undefined) {
      turn = e.turnId
      await update($, isWorking, () => true)
      await startAnim($)
    } else {
      await refreshCompanions($)
    }

    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const completed = await next(e)

    if (e.agentId === undefined) {
      await update($, isWorking, () => false)
      await stopAnim($)
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

      // The engine's fill is the last response's input, so until the next one
      // it still reads the size before: take the size after in its place.
      if (e.agentId === undefined && e.trigger !== 'precompute' && tokensAfter !== undefined) {
        await update($, meters, current => current && {
          ...current,
          contextTokens: tokensAfter,
          contextPercent: Math.round((tokensAfter / current.window) * 100),
        })
      }
    }

    return compacted
  }).catch(($, e, next) => next(e))

  on('session.measure', async ($, e, next) => {
    await update($, meters, () => fromMeasure(e))

    return next(e)
  }).catch(($, e, next) => next(e))

  const settings = { detail, bars, graphics, zones: typeof options.zones === 'string' ? options.zones.trim() : '' }

  // A skill file gives each command its /quest-hud: name; the mod answers it, so
  // no model turn runs. If a hook fails, the skill's text says the mod is not running.
  on('command.run', { command: 'quest-hud:help' }, async () => ({ text: usageText(settings) })).catch(($, e, next) => next(e))

  on('command.run', { command: 'quest-hud:statusline' }, async $ => ({ text: help($.plugin.root) })).catch(($, e, next) => next(e))

  on('command.run', { command: 'quest-hud:pane' }, async $ => ({ text: await openRoad($) })).catch(($, e, next) => next(e))

  on('command.run', { command: 'quest-hud:status' }, async $ => ({ text: await statusLines($) })).catch(($, e, next) => next(e))

  on('command.run', { command: 'quest-hud:level' }, async $ => ({ text: await levelCommand($) })).catch(($, e, next) => next(e))

  on('command.run', { command: 'quest-hud:level-up' }, async $ => ({ text: await levelUpCommand($) })).catch(($, e, next) => next(e))

  on('command.run', { command: 'quest-hud:off' }, async $ => ({ text: await turnOff($) })).catch(($, e, next) => next(e))

  on('command.run', { command: 'quest-hud:on' }, async $ => ({ text: await turnOn($, detail) })).catch(($, e, next) => next(e))

  // The bare name takes the same words after a space, and any other word gets a
  // free answer: a typo after the colon goes to the model, one after the space stops here.
  on('command.run', { command: 'quest-hud' }, async ($, e) => {
    const word = e.args.trim().toLowerCase()

    if (word === '' || word === 'help') return { text: usageText(settings) }
    if (word === 'status') return { text: await statusLines($) }
    if (word === 'pane') return { text: await openRoad($) }
    if (word === 'statusline') return { text: help($.plugin.root) }
    if (word === 'level') return { text: await levelCommand($) }
    if (word === 'level-up') return { text: await levelUpCommand($) }
    if (word === 'off') return { text: await turnOff($) }
    if (word === 'on') return { text: await turnOn($, detail) }

    return { text: unknownText(e.args.trim(), settings) }
  })

  // detail = status: dim text at the end of the engine's hint line, which keeps its own
  // words and pills. Reading the atoms here redraws the line when one changes.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (detail !== 'status' || (await read($, hidden))) return next(e)

    const text = hintText(await read($, quest), await read($, tasks), await currentMeters($), bars)

    return next({ ...e, props: { ...e.props, tail: e.props.tail === undefined ? text : `${e.props.tail} ${text}` } })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)

    if (!hasBand || e.props.hasSurvey || (await read($, hidden))) {
      return below
    }

    const band = bandModel(await read($, quest), await read($, tasks), await currentMeters($), bars, await $.clock.now())
    const elements = $.ui.resolve(e)
    const { Box, Text } = elements
    const hasRoom = e.props.maxRows >= BAND.rows
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
    const isRaster = hasRoom && e.surface === 'terminal' && 'Raster' in elements
    anim.band = isRaster ? e.requestId : undefined
    const avatar = !hasRoom
      ? null
      : isRaster && 'Raster' in elements
        ? <elements.Raster key={BAND_KEY} columns={BAND.columns} rows={BAND.rows} cells={artCells(bandPortrait(anim.motion.pose))} />
        : 'Svg' in elements
          ? <elements.Svg source={gridToSvg(downsample(bandPortrait(), ART_SCALE))} alt="the wizard" width={BAND.columns * 4} height={BAND.rows * 8} />
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
    // The terminal draws images when they are forced, or in auto until the
    // probe has found they do not draw here; every other surface, an Svg.
    const images = await read($, imagesWork)
    const mode: SceneMode = e.surface !== 'terminal'
      ? 'svg'
      : graphics === 'images' || (graphics === 'auto' && images !== false) ? 'image' : 'raster'

    // A pane too narrow for a scene draws none, so nothing bobs there.
    const hasScene = e.props.bodyColumns >= SCENE_MIN_COLUMNS
    anim.columns = e.props.bodyColumns
    anim.mode = hasScene ? mode : undefined
    // The first draw learns the zone; a later change of it slides (noteZone).
    anim.zone ??= sceneZone(await read($, quest), await read($, activity))

    // The desktop's Svg does not animate, nor a pane too narrow for a scene: one left running stops here.
    if ((mode === 'svg' || !hasScene) && anim.timer !== undefined) stopTimer()

    // A turn that began before the pane's first draw had no surface to animate on:
    // the draw starts it. startAnim does nothing if one already runs.
    // Not awaited, so the draw is not held up; a start that fails leaves no timer.
    if (await read($, isWorking)) startAnim($).catch(() => stopTimer())

    const view = road({
      quest: await read($, quest),
      tasks: await read($, tasks),
      meters: await currentMeters($),
      log: await read($, log),
      companions: await read($, companions),
      activity: await read($, activity),
      foes: await read($, foes),
      loot: await read($, loot),
      allies: await read($, allies),
      level: await currentLevel($),
      bars,
      columns: e.props.bodyColumns,
      rows: e.viewport?.rows ?? 30,
      motion: anim.motion,
      ...transition(),
      cells: mode === 'raster',
    })
    const image = mode === 'image' && hasScene ? sceneImage(view.art) : undefined

    // The first image of a session in auto: once it is drawn, blit it back to
    // learn whether the terminal shows it. Writes happen in the timer, not here.
    if (image && graphics === 'auto' && images === null && !probe.isPending) {
      probe.isPending = true
      const generation = probe.generation
      probe.timer = $.clock.after(PROBE_MS, () => void probeImages($, image, generation))
    }

    return drawRoad($, e, view, mode, image)
  })
}
