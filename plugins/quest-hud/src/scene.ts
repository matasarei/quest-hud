// The Road pane's scene, as pixel art after the claude-rpg banner: the zone's
// landscape drawn in code (src/world/landscapes.ts), its landmarks at the
// right, what the session gathered beside them, the task list as flags, the
// wizard beside the flag in progress with Claude's mascot at his heel, the
// subagents' ghosts behind, and any monster ahead. Drawn at ART_SCALE art
// pixels a unit, then each block reduced to its most common colour: the
// scene is `columns × SCENE_HEIGHT` pixels, one a unit, for every surface.
// Pure: it returns a Grid, which the pane draws as a Raster, an Image or an Svg.
import type { Allies, FightKind, Foes, Task, Zone } from '../types'
import type { Grid } from './avatar'
import { downsample, mirrorGrid, spriteGrid, stamp, type Canvas, type Sprite } from './paint/pixels'
import { rasterize, rgbToGrid } from './paint/raster'
import { landscape } from './world/landscapes'
import { ART_SCALE, CHEST, DRAGON, FLAG, FOX, GHOST, MASCOT, OCTOCAT, PROPS, SPIDER, WALK, WIZARD, type Pose, type PropName } from './world/sprites'

/** Pixel rows: fourteen terminal rows of half blocks. */
export const SCENE_HEIGHT = 28
/** Where the ground starts: figures stand on it. */
export const GROUND_ROW = 24
/** More tasks than this share flags. */
export const MAX_FLAGS = 12
/** More subagents than this are counted in the pane's text, not drawn. */
export const MAX_GHOSTS = 4

/** A sprite's width in scene units. */
const units = (sprite: Sprite): number => (sprite.rows[0]?.length ?? 0) / ART_SCALE

/** The figures' widths in units. */
export const SIZE = { wizard: units(WIZARD.stand), foe: units(DRAGON), familiar: units(MASCOT.still), extra: units(CHEST) } as const
/** A flag's width in units. */
export const FLAG_WIDTH = units(FLAG.done)
/** Units a flag takes, with the gap to the next one. */
export const FLAG_SLOT = FLAG_WIDTH + 3
/** Units between ghosts trailing the wizard. */
const GHOST_STEP = 10
/** How far behind the wizard's box Claude's mascot stands: at his heel, where his sprite's margin is. */
const FAMILIAR_BEHIND = 6
/** Units between the wizard and the first monster, and between monsters. */
const FOE_GAP = 2
/** The least a monster behind another shows of itself, in units, when the road is short. */
const FOE_PEEK = 10
const NO_FOES: Foes = { test: 'none', lint: 'none' }

export type Waypoint = 'done' | 'now' | 'todo'

/** A zone's landmarks, standing at the right of the road, left to right: the last is the one kept longest. */
export type Prop = PropName
export const ZONE_PROPS: Readonly<Record<Zone, readonly Prop[]>> = {
  wilds: ['bush', 'signpost'],
  map: ['lectern', 'globe'],
  forge: ['barrel', 'anvil'],
  arena: ['banner', 'rack'],
  harbour: ['barrel', 'anchor'],
  watchtower: ['pine', 'tower'],
  dungeon: ['tomb', 'torch'],
  camp: ['campfire', 'tent'],
}

/** One waypoint per task, in order, at most MAX_FLAGS: the flag a task falls on takes its most urgent state. */
export const waypointsOf = (tasks: readonly Task[]): Waypoint[] =>
  fitWaypoints(
    tasks.map(task => (task.status === 'in_progress' ? 'now' : task.status === 'completed' ? 'done' : 'todo')),
    MAX_FLAGS,
  )

/** At most `slots` flags: neighbours share one, which shows the most urgent of their states. */
export const fitWaypoints = (waypoints: readonly Waypoint[], slots: number): Waypoint[] => {
  const count = Math.max(0, Math.min(waypoints.length, Math.floor(slots)))
  const flags: Waypoint[] = Array<Waypoint>(count).fill('done')
  const rank: Readonly<Record<Waypoint, number>> = { done: 0, todo: 1, now: 2 }

  if (count === 0) return flags

  waypoints.forEach((state, i) => {
    const flag = Math.floor((i * count) / waypoints.length)
    if (rank[state] > rank[flags[flag] ?? 'done']) flags[flag] = state
  })

  return flags
}

const propsUnits = (props: readonly Prop[]): number => props.reduce((sum, prop) => sum + units(PROPS[prop]), 0)

/** The units the zone's landmarks take at the right, with their margin. */
export const propsWidth = (zone: Zone): number => propsUnits(ZONE_PROPS[zone]) + 4

/** What the session gathered, standing left of the zone's landmarks. */
export type Extras = { loot?: number; allies?: Allies }

/**
 * The gathered things, right to left: the chest once there is loot, then
 * GitHub's Octocat and GitLab's fox once they came, the fox turned to face the road.
 */
const extraGrids = ({ loot = 0, allies }: Extras): Grid[] => [
  ...(loot > 0 ? [spriteGrid(CHEST)] : []),
  ...(allies?.octopus ? [spriteGrid(OCTOCAT)] : []),
  ...(allies?.fox ? [mirrorGrid(spriteGrid(FOX))] : []),
]

/** Units between gathered things, and between them and the landmarks. */
const EXTRA_GAP = 2

const extrasUnits = (extras: Extras): number =>
  extraGrids(extras).reduce((sum, grid) => sum + (grid[0]?.length ?? 0) / ART_SCALE + EXTRA_GAP, 0)

/** The road's width: the span left of the landmarks, and of what the session gathered, where flags and figures go. */
export const roadWidth = (columns: number, zone: Zone, extras: Extras = {}): number =>
  Math.max(0, Math.floor(columns) - propsWidth(zone) - extrasUnits(extras))

/** How many flags fit across a road of `width` units. */
export const flagSlots = (width: number): number => Math.max(0, Math.floor((width - 4) / FLAG_SLOT))

/** The x a flag starts at: its share of the road, from a margin of 2. */
export const waypointX = (index: number, count: number, width: number): number =>
  Math.round(2 + (index * Math.max(0, width - 4)) / Math.max(1, count))

/**
 * Where the wizard's sprite starts: just right of the flag in progress, else
 * of the first flag still to do; of the last flag when all are done; at the
 * left margin when there are none.
 */
export const avatarX = (waypoints: readonly Waypoint[], width: number): number => {
  if (waypoints.length === 0) return 2
  const now = waypoints.indexOf('now')
  const index = now >= 0 ? now : waypoints.indexOf('todo')
  const at = index >= 0 ? index : waypoints.length - 1
  return waypointX(at, waypoints.length, width) + FLAG_WIDTH
}

export type SceneArgs = {
  columns: number
  zone: Zone
  waypoints: readonly Waypoint[]
  companions: number
  /** The monsters on the road; none when left out. */
  foes?: Foes
  /** The commits made this session; none when left out. */
  loot?: number
  /** The Octocat and the fox; neither when left out. */
  allies?: Allies
  /** How far along the road, and how the wizard and the mascot stand; at rest from the start when left out. */
  motion?: Motion
  /** A zone change under way: the landscape of `from` sliding out to the left, `progress` from 0 to 1. */
  transition?: Transition
}

/** A zone change under way: the old landscape slides out to the left as the new one comes in from the right. */
export type Transition = { from: Zone; progress: number }

/** How many frames a zone change takes: six, about a second and a half. */
export const TRANSITION_STEPS = 6

/** A frame of the walk: how many steps along the road, the wizard's pose, and whether the mascot is mid-hop. */
export type Motion = { step: number; pose: Pose; hop: boolean }

/** Standing at the start of the road. */
export const REST: Motion = { step: 0, pose: 'stand', hop: false }

/**
 * The next frame of the animation, its `tick`th: a step further along the
 * road, the next of the walk's four poses, the mascot hopping every other
 * frame. While a fight is on, the wizard stops and strikes and stands in
 * turn, and the road stays where it is.
 */
export const nextMotion = (motion: Motion, tick: number, isFighting: boolean): Motion =>
  isFighting
    ? { step: motion.step, pose: tick % 2 === 0 ? 'strike' : 'stand', hop: false }
    : { step: motion.step + 1, pose: WALK[tick % WALK.length] ?? 'stand', hop: tick % 2 === 1 }

/** The figures at rest where the walk got to. */
export const atRest = (motion: Motion): Motion => ({ step: motion.step, pose: 'stand', hop: false })

/** The flags a road keeps room for, when there are that many tasks: the one in progress and one each side. */
export const MIN_FLAGS = 3

/**
 * What a scene keeps on a pane of its width: the zone's landmarks, what the
 * session gathered, the road left, and the span at its start the flags
 * spread over — the whole road, or MIN_FLAGS packed at the left when short.
 */
export type Layout = { props: readonly Prop[]; extras: Extras; road: number; flagRoad: number; isPacked: boolean }

/** Where the flags, the wizard and the first monster go on a road laid out so. */
export type Figures = { flagXs: number[]; hero: number; ahead: number }

/**
 * The flags' x, the wizard's, and where the monsters may start. Spread: the
 * flags share the road and the wizard stands just right of the one in
 * progress. Packed: the flags up to the one in progress stand at the left,
 * the wizard beside it, and the flags still to do right after the wizard, so
 * none is hidden; the monsters stand beyond them.
 */
export const figures = (flags: readonly Waypoint[], { flagRoad, isPacked }: Pick<Layout, 'flagRoad' | 'isPacked'>): Figures => {
  const hero = avatarX(flags, flagRoad)
  if (!isPacked || flags.length === 0) {
    return { flagXs: flags.map((_, i) => waypointX(i, flags.length, flagRoad)), hero, ahead: hero + SIZE.wizard }
  }
  const now = flags.indexOf('now')
  const at = now >= 0 ? now : flags.indexOf('todo') >= 0 ? flags.indexOf('todo') : flags.length - 1
  const packedHero = 2 + at * FLAG_SLOT + FLAG_WIDTH
  const flagXs = flags.map((_, i) => (i <= at ? 2 + i * FLAG_SLOT : packedHero + SIZE.wizard + 1 + (i - at - 1) * FLAG_SLOT))
  const last = flagXs[flagXs.length - 1] ?? 0
  return { flagXs, hero: packedHero, ahead: Math.max(packedHero + SIZE.wizard, at < flags.length - 1 ? last + FLAG_WIDTH + 1 : 0) }
}

/** The span MIN_FLAGS flags take packed at the left: as few as there are tasks. */
const packedFlagRoad = (waypoints: readonly Waypoint[]): number => 4 + Math.min(waypoints.length, MIN_FLAGS) * FLAG_SLOT

/**
 * Whether a road `width` units wide, its flags spread over `flagRoad`, has
 * room for what it must show: the flags up to MIN_FLAGS, and the wizard with
 * every monster that is up beside him, each at full width.
 */
export const roadFits = (width: number, laid: Pick<Layout, 'flagRoad' | 'isPacked'>, waypoints: readonly Waypoint[], foes: Foes): boolean => {
  const flags = fitWaypoints(waypoints, flagSlots(laid.flagRoad))
  if (flags.length < Math.min(waypoints.length, MIN_FLAGS)) return false
  const up = (['test', 'lint'] as const).filter(kind => foes[kind] !== 'none').length
  const { ahead } = figures(flags, laid)
  return ahead + up * (FOE_GAP + SIZE.foe) <= width
}

/** The road left of these landmarks and gathered things. */
const roadLeft = (columns: number, props: readonly Prop[], extras: Extras): number =>
  Math.max(0, Math.floor(columns) - propsUnits(props) - 4 - extrasUnits(extras))

/**
 * What the scene keeps: everything when the road has room, else things give
 * way one at a time until it does — the zone's landmarks from the left,
 * keeping its last; then the fox, the Octocat and the chest; then that last
 * landmark. A thing gives way only when even the flags packed at the left
 * leave no room.
 */
export const layout = ({ columns, zone, waypoints, foes = NO_FOES, loot = 0, allies }: Pick<SceneArgs, 'columns' | 'zone' | 'waypoints' | 'foes' | 'loot' | 'allies'>): Layout => {
  let props: readonly Prop[] = ZONE_PROPS[zone]
  let extras: Extras = allies === undefined ? { loot } : { loot, allies }
  const candidates: Array<Pick<Layout, 'props' | 'extras'>> = [{ props, extras }]

  while (props.length > 1) {
    props = props.slice(1)
    candidates.push({ props, extras })
  }
  for (const ally of ['fox', 'octopus'] as const) {
    if (extras.allies?.[ally]) {
      extras = { ...extras, allies: { ...extras.allies, [ally]: false } }
      candidates.push({ props, extras })
    }
  }
  if ((extras.loot ?? 0) > 0) {
    extras = { ...extras, loot: 0 }
    candidates.push({ props, extras })
  }
  if (props.length > 0) candidates.push({ props: [], extras })

  // What gives way is decided on the packed flags, the least room the road
  // needs, so it only ever grows as the pane narrows; the flags then spread
  // over the whole road whenever they fit there.
  const laid = candidates.map(kept => {
    const road = roadLeft(columns, kept.props, kept.extras)
    return {
      spread: { ...kept, road, flagRoad: road, isPacked: false },
      packed: { ...kept, road, flagRoad: Math.min(road, packedFlagRoad(waypoints)), isPacked: true },
    }
  })
  const chosen = laid.find(({ packed }) => roadFits(packed.road, packed, waypoints, foes)) ?? laid[laid.length - 1]
  if (chosen === undefined) throw new Error('layout: no candidates')
  return roadFits(chosen.spread.road, chosen.spread, waypoints, foes) ? chosen.spread : chosen.packed
}

/**
 * Where the monster in place `index` of `count` starts: right of the wizard,
 * the first nearest. On a short road the ones behind close up, down to
 * FOE_PEEK units apart, and all of them move left as far as the wizard to
 * stay off the landmarks; past that they stand in front of them.
 */
export const foeX = (hero: number, width: number, count: number, index: number, ahead = hero + SIZE.wizard): number => {
  const size = SIZE.foe
  const start = ahead + FOE_GAP
  const pitch = count <= 1 ? size + FOE_GAP : Math.max(FOE_PEEK, Math.min(size + FOE_GAP, Math.floor((width - start - size) / (count - 1))))
  const first = Math.max(ahead, Math.min(start, width - (count - 1) * pitch - size))
  return first + index * pitch
}

/** A monster facing left, towards the wizard: the dragon is drawn facing right. */
const foeGrid = (kind: FightKind): Grid => (kind === 'test' ? mirrorGrid(spriteGrid(DRAGON)) : spriteGrid(SPIDER))

/**
 * Two landscapes side by side, `progress` of the way from the first to the
 * second: the first slides out to the left as the second comes in from the right.
 */
export const slide = (from: Grid, to: Grid, progress: number): Canvas => {
  const width = to[0]?.length ?? 0
  const shift = Math.round(width * Math.max(0, Math.min(1, progress)))
  return to.map((line, y) => line.map((color, x) => (x + shift < width ? from[y]?.[x + shift] : to[y]?.[x + shift - width]) ?? color))
}

/** Paints a sprite's grid with its feet on the ground, its left edge at `x` units. */
const standAt = (art: Canvas, grid: Grid, x: number): void => stamp(art, grid, x * ART_SCALE, GROUND_ROW * ART_SCALE - grid.length)

/**
 * The scene as columns × SCENE_HEIGHT pixels, one a unit: the landscape
 * `motion.step` steps along, the wizard in his pose, the mascot hopping or not.
 */
export const scene = (args: SceneArgs): Grid => {
  const { columns, zone, waypoints, companions, foes = NO_FOES, motion = REST, transition } = args
  const width = Math.max(0, Math.floor(columns))
  const backdrop = (z: Zone): Grid => rgbToGrid(rasterize(landscape(z, width, motion.step), width, SCENE_HEIGHT, ART_SCALE, 0, { pixel: true, bands: 5 }))
  const art: Canvas = transition !== undefined && transition.from !== zone && transition.progress < 1
    ? slide(backdrop(transition.from), backdrop(zone), transition.progress)
    : backdrop(zone).map(row => [...row])
  const kept = layout({ ...args, columns: width })

  let right = width - 2
  for (const prop of [...kept.props].reverse()) {
    right -= units(PROPS[prop])
    standAt(art, spriteGrid(PROPS[prop]), right)
  }
  for (const grid of extraGrids(kept.extras)) {
    right -= (grid[0]?.length ?? 0) / ART_SCALE + EXTRA_GAP
    standAt(art, grid, right)
  }

  const flags = fitWaypoints(waypoints, flagSlots(kept.flagRoad))
  const placed = figures(flags, kept)
  const hero = Math.max(placed.hero, FAMILIAR_BEHIND)

  // Ghosts first, behind everything on the road; one with no room is not drawn: the pane's text names it.
  for (let k = Math.min(companions, MAX_GHOSTS); k >= 1; k--) {
    const x = hero - FAMILIAR_BEHIND - GHOST_STEP * k
    if (x >= -4) standAt(art, spriteGrid(GHOST), x)
  }

  flags.forEach((state, i) => standAt(art, spriteGrid(FLAG[state]), placed.flagXs[i] ?? 0))

  standAt(art, spriteGrid(motion.hop ? MASCOT.hop : MASCOT.still), hero - FAMILIAR_BEHIND)

  // The monsters face the wizard from the right: the dragon nearest, the spider
  // behind it, drawn first so the dragon stands in front.
  const up = (['test', 'lint'] as const).filter(kind => foes[kind] !== 'none')
  for (let i = up.length - 1; i >= 0; i--) {
    standAt(art, foeGrid(up[i] as FightKind), foeX(hero, kept.road, up.length, i, Math.max(placed.ahead, hero + SIZE.wizard)))
  }

  standAt(art, spriteGrid(WIZARD[motion.pose]), hero)

  return downsample(art, ART_SCALE)
}

/** The band's portrait above the prompt, in cells: 8 columns by 3 rows. */
export const BAND = { columns: 8, rows: 3 } as const

/** The art row the band's portrait starts at: below the hat's tip, so the brim, the face and the beard fit. */
const PORTRAIT_TOP = 3

/**
 * The band's portrait: the wizard's hat, face and beard, 12 art rows of his
 * sprite in the pose given, reduced like the scene to 8 × 6 pixels.
 */
export const bandPortrait = (pose: Pose = 'stand'): Grid =>
  downsample(
    spriteGrid(WIZARD[pose]).slice(PORTRAIT_TOP, PORTRAIT_TOP + BAND.rows * 2 * ART_SCALE).map(line => line.slice(8, 8 + BAND.columns * ART_SCALE)),
    ART_SCALE,
  )

/** The colour a zone's scene starts with: its top-left pixel, the sky's or the wall's. */
export const skyColor = (zone: Zone): number => scene({ columns: 4, zone, waypoints: [], companions: 0 })[0]?.[0] ?? 0
