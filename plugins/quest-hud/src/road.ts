// What the Road pane shows, as plain values for a given size: the header, the
// scene, the companions, a window of the task list, the bars and the log's
// tail. Pure; hooks/pane.tsx only lays it out.
import type { Allies, Companion, Foes, LevelCard, LogEntry, Meters, Quest, Task, Zone } from '../types'
import type { Grid } from './avatar'
import { clockTime } from './log'
import { bar, hpLeft, mpLeft, zoneLine, type Bars, type Segment } from './meters'
import { cleanTitle } from './quest'
import { downsample } from './paint/pixels'
import { MAX_GHOSTS, sceneArt, SCENE_HEIGHT, waypointsOf, type Motion, type Transition } from './scene'
import { ART_SCALE } from './world/sprites'
import { progress } from './tasks'

/** Rows the scene takes: two pixel rows per terminal row. */
export const SCENE_ROWS = SCENE_HEIGHT / 2
/** Below this many columns the pane draws no scene: its rows go to the tasks and the log. */
export const SCENE_MIN_COLUMNS = 32
/** At most this many tasks are listed; the one in progress is always among them. */
export const MAX_TASK_ROWS = 8
const BAR_WIDTH = 10

export type RoadArgs = {
  quest: Quest | null
  tasks: readonly Task[]
  meters: Meters | null
  log: readonly LogEntry[]
  companions: readonly Companion[]
  activity: Zone | null
  /** The monsters on the road. */
  foes: Foes
  /** The commits made this session. */
  loot: number
  /** The octopus and the fox, once gh and glab ran. */
  allies: Allies
  bars: Bars
  columns: number
  rows: number
  /** How far along the road the figures are, and how they stand; at rest when left out. */
  motion?: Motion
  /** A zone change under way. */
  transition?: Transition
  /** Drawn as text cells: the art's dither in row pairs (SceneArgs.cells). */
  cells?: boolean
  /** What /quest-hud:level last worked out; none before its first run. */
  level?: LevelCard | null
}

export type Road = {
  header: string
  count?: string
  /** The scene, one pixel a unit: text cells and the desktop's Svg. */
  scene: Grid
  /** The same scene at the art's resolution, ART_SCALE pixels a unit: an Image. */
  art: Grid
  companions?: string
  tasks: string[]
  meters: Segment[]
  /** The level, at the right end of the meters row; left out when it does not fit. */
  level?: string
  log: string[]
}

/** The zone the scene shows: the skill's, or in the Wilds the last kind of work. */
export const sceneZone = (quest: Quest | null, activity: Zone | null): Zone => quest?.zone ?? activity ?? 'wilds'

type SceneInputs = Pick<RoadArgs, 'quest' | 'tasks' | 'companions' | 'activity' | 'foes' | 'loot' | 'allies' | 'columns' | 'motion' | 'transition' | 'cells'>

/** The scene alone at the art's resolution, for an Image's redraw or a blit of one frame. */
export const roadArt = (args: SceneInputs): Grid =>
  sceneArt({
    columns: args.columns,
    zone: sceneZone(args.quest, args.activity),
    waypoints: waypointsOf(args.tasks),
    companions: args.companions.length,
    foes: args.foes,
    loot: args.loot,
    allies: args.allies,
    ...(args.motion === undefined ? {} : { motion: args.motion }),
    ...(args.transition === undefined ? {} : { transition: args.transition }),
    ...(args.cells === undefined ? {} : { cells: args.cells }),
  })

/** The scene alone, one pixel a unit: for cells. */
export const roadScene = (args: SceneInputs): Grid => downsample(roadArt(args), ART_SCALE)

const mark = (task: Task): string => (task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▸' : '·')

/** Up to `room` tasks around the one in progress (or the first open one), in order. */
export const taskWindow = (tasks: readonly Task[], room: number): string[] => {
  if (room <= 0 || tasks.length === 0) return []
  const focus = Math.max(0, tasks.findIndex(t => t.status === 'in_progress') >= 0
    ? tasks.findIndex(t => t.status === 'in_progress')
    : tasks.findIndex(t => t.status !== 'completed'))
  const size = Math.min(room, tasks.length)
  const start = Math.min(Math.max(0, focus - Math.floor(size / 2)), tasks.length - size)
  return tasks.slice(start, start + size).map(task => `${mark(task)} ${cleanTitle(task.subject)}`)
}

const meterSegments = (meters: Meters | null, bars: Bars): Segment[] => {
  const segments: Segment[] = []
  const hp = hpLeft(meters)
  const mp = mpLeft(meters)

  if (hp !== undefined) segments.push({ text: `♥ ${bar(hp, BAR_WIDTH)} ${hp}%   `, tone: 'hp' })
  segments.push({ text: mp === undefined ? '✦ —' : `✦ ${bar(mp, BAR_WIDTH)} ${mp}%`, tone: 'mp' })
  if (bars === 'all' && meters?.fiveHourUsed !== undefined) segments.push({ text: `   ⚡${Math.round(meters.fiveHourUsed)}%`, tone: 'five' })
  if (bars === 'all' && meters?.costUsd !== undefined) segments.push({ text: `   ◉ $${meters.costUsd.toFixed(2)}`, tone: 'gold' })

  return segments
}

/** The room kept between the bars and the level. */
const LEVEL_GAP = 2

/** The level as the row has room for it: with its title, without, or not at all. */
const levelTag = (card: LevelCard | null | undefined, meters: readonly Segment[], columns: number): string | undefined => {
  if (!card) return undefined

  const room = columns - LEVEL_GAP - meters.reduce((sum, segment) => sum + segment.text.length, 0)
  return [`Lv ${card.level} ${card.title}`, `Lv ${card.level}`].find(tag => tag.length <= room)
}

/**
 * The pane for `rows` rows: the header, the scene, the companions line when
 * there are any, then the tasks, the bars, and the log's newest lines with
 * whatever room is left. The log goes first when room is short, then tasks.
 */
export const road = (args: RoadArgs): Road => {
  const { quest, tasks, meters, log, companions, loot, bars, columns, rows } = args
  const { done, total } = progress(tasks)
  const header = quest ? `⚔ ${quest.title} · ${zoneLine(quest.zone)}` : zoneLine('wilds')
  const shown = companions.slice(0, MAX_GHOSTS).map(c => c.type)
  const extra = companions.length - shown.length
  const companionsLine = companions.length > 0 ? `with ${shown.join(', ')}${extra > 0 ? ` (+${extra})` : ''}` : undefined

  const hasScene = columns >= SCENE_MIN_COLUMNS
  let room = rows - 1 - (hasScene ? SCENE_ROWS : 0) - (companionsLine ? 1 : 0) - 1
  const taskRows = taskWindow(tasks, Math.min(MAX_TASK_ROWS, Math.max(0, room)))
  room -= taskRows.length
  const logRoom = room >= 2 ? room - 1 : 0
  const logRows = logRoom > 0
    ? log.slice(-logRoom).map(entry => `${clockTime(entry.at)} ${entry.kind.padEnd(5)} ${entry.text}`)
    : []

  const art = hasScene ? roadArt({ ...args, columns }) : []
  const meterRow = meterSegments(meters, bars)
  const levelText = levelTag(args.level, meterRow, columns)

  return {
    header,
    ...(total > 0 || loot > 0 ? { count: [total > 0 ? `task ${done}/${total}` : '', loot > 0 ? `loot ${loot}` : ''].filter(Boolean).join(' · ') } : {}),
    scene: downsample(art, ART_SCALE),
    art,
    ...(companionsLine ? { companions: companionsLine } : {}),
    tasks: taskRows,
    meters: meterRow,
    ...(levelText === undefined ? {} : { level: levelText }),
    log: logRows,
  }
}
