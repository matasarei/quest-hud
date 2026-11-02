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
import { landscape, PARALLAX } from './world/landscapes'
import { ART_SCALE, BAND_AVATARS, CHEST, DRAGON, FLAG, FLYING_BOOKS, FOX, GHOST, GOLEM, MASCOT, OCTOCAT, PROPS, SKELETON, SPIDER, WALK, WIZARD, type Avatar, type Pose, type PropName } from './world/sprites'

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
export const SIZE = { wizard: units(WIZARD.stand), foe: units(DRAGON.still), familiar: units(MASCOT.still), extra: units(CHEST) } as const
/** A flag's width in units. */
export const FLAG_WIDTH = units(FLAG.done)
/** Units a flag takes, with the gap to the next one. */
export const FLAG_SLOT = FLAG_WIDTH + 3
/** Units of open road before the landmarks come round again. */
const LANDMARK_GAP = 12
/** Units between ghosts trailing the wizard. */
const GHOST_STEP = 10
/** How far behind the wizard's box Claude's mascot stands: at his heel, where his sprite's margin is. */
const FAMILIAR_BEHIND = 6
/** Units between the wizard and the first monster, and between monsters. */
const FOE_GAP = 2
/** The least a monster behind another shows of itself, in units, when the road is short. */
const FOE_PEEK = 10
/** Less still, when only that keeps both monsters on a narrow road: below it the one behind is not drawn. */
const FOE_MIN_PEEK = 6
const NO_FOES: Foes = { test: 'none', lint: 'none' }

export type Waypoint = 'done' | 'now' | 'todo'

/**
 * A zone's landmarks, left to right: the last is the one kept longest. At
 * rest they stand at the right of the road; walking, they pass by.
 */
export type Prop = PropName
export const ZONE_PROPS: Readonly<Record<Zone, readonly Prop[]>> = {
  wilds: ['mushrooms', 'oak', 'crystal'],
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

/** GitHub's Octocat and GitLab's fox once they came, right to left, the fox turned to face the road; on the mascot's hop, theirs too. */
const allyGrids = ({ allies }: Extras, hop = false): Array<{ kind: 'octopus' | 'fox'; grid: Grid }> => [
  ...(allies?.octopus ? [{ kind: 'octopus' as const, grid: spriteGrid(hop ? OCTOCAT.hop : OCTOCAT.still) }] : []),
  ...(allies?.fox ? [{ kind: 'fox' as const, grid: mirrorGrid(spriteGrid(hop ? FOX.hop : FOX.still)) }] : []),
]

/** The gathered things, right to left: the chest once there is loot, then the allies. */
const extraGrids = (extras: Extras): Grid[] => [...((extras.loot ?? 0) > 0 ? [spriteGrid(CHEST)] : []), ...allyGrids(extras).map(ally => ally.grid)]

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
  /**
   * Drawn as text cells, which halve the art's rows: the backdrop's dither then
   * holds for each pair of rows, so the halved art keeps it whole rather than in
   * vertical stripes. Images leave it out and keep their finer dither.
   */
  cells?: boolean
}

/** A zone change under way: the old landscape slides out to the left as the new one comes in from the right. */
export type Transition = { from: Zone; progress: number }

/** How many frames a zone change takes: six, about a second and a half. */
export const TRANSITION_STEPS = 6

/**
 * A frame of the walk: how many steps along the road, the wizard's pose,
 * whether the mascot is mid-hop, and — on the frames a monster holding the
 * Road strikes back, while the wizard stands — `lunge`.
 */
export type Motion = { step: number; pose: Pose; hop: boolean; lunge?: boolean }

/** Standing at the start of the road. */
export const REST: Motion = { step: 0, pose: 'stand', hop: false }

/**
 * The next frame of the animation, its `tick`th: a step further along the
 * road, the next of the walk's four poses, the mascot hopping every other
 * frame. While a fight is on, the road stays where it is and the wizard and
 * the monster trade blows: he strikes, then stands as it lunges.
 */
export const nextMotion = (motion: Motion, tick: number, isFighting: boolean): Motion =>
  isFighting
    ? tick % 2 === 0
      ? { step: motion.step, pose: 'strike', hop: false }
      : { step: motion.step, pose: 'stand', hop: false, lunge: true }
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
 * past the flags `ahead` of him, the first nearest. On a short road the ones
 * behind close up, down to FOE_PEEK units apart, and all of them move left to
 * stay off the landmarks and inside the road: in front of the flags ahead, as
 * far as the wizard, the ones behind closing up to FOE_MIN_PEEK if that is
 * what keeps them in. With no room even then, they stand against the wizard.
 */
export const foeX = (hero: number, width: number, count: number, index: number, ahead = hero + SIZE.wizard): number => {
  const size = SIZE.foe
  const wall = hero + SIZE.wizard
  const start = ahead + FOE_GAP
  let pitch = count <= 1 ? size + FOE_GAP : Math.max(FOE_PEEK, Math.min(size + FOE_GAP, Math.floor((width - start - size) / (count - 1))))
  if (count > 1 && wall + (count - 1) * pitch + size > width && wall + (count - 1) * FOE_MIN_PEEK + size <= width) {
    pitch = Math.floor((width - wall - size) / (count - 1))
  }
  const first = Math.max(wall, Math.min(start, width - (count - 1) * pitch - size))
  return first + index * pitch
}

/**
 * The monsters that go on the road, nearest first: all of them while the ones
 * behind can still peek out by FOE_MIN_PEEK, else only the nearest. The log
 * names every fight either way.
 */
export const foesShown = <T>(hero: number, width: number, up: readonly T[]): T[] =>
  up.length <= 1 || hero + SIZE.wizard + (up.length - 1) * FOE_MIN_PEEK + SIZE.foe <= width ? [...up] : up.slice(0, 1)

/** A monster on the road: which fight, and where it starts, in units. */
export type FoeOnRoad = { kind: FightKind; x: number }

/** The monsters a frame draws, nearest first: the ones that fit, each where `foeX` puts it. */
const placeFoes = (hero: number, road: number, ahead: number, foes: Foes): FoeOnRoad[] => {
  const shown = foesShown(hero, road, (['test', 'lint'] as const).filter(kind => foes[kind] !== 'none'))
  return shown.map((kind, i) => ({ kind, x: foeX(hero, road, shown.length, i, Math.max(ahead, hero + SIZE.wizard)) }))
}

/** Where a scene's monsters stand, with the wizard and the road they stand on: what `sceneArt` draws. */
export const foesOnRoad = (args: SceneArgs): { hero: number; road: number; shown: FoeOnRoad[] } => {
  const { hero, road, foes } = party(args)
  return { hero, road, shown: foes.map(({ kind, x }) => ({ kind, x })) }
}

/**
 * The monster of a test run in a room, where a dragon would not fit; outdoors
 * it is the dragon. Each is drawn facing left, towards the wizard.
 */
const ROOM_FOE: Readonly<Partial<Record<Zone, Monster>>> = { dungeon: SKELETON, forge: GOLEM, map: FLYING_BOOKS }

/** A monster's two frames: at rest, and lunging as the wizard stands between his strikes. */
type Monster = { still: Sprite; lunge: Sprite }

/**
 * A monster facing left, towards the wizard, at rest or `lunge`-ing: a lint
 * run's spider anywhere; a test run's the room's own monster, or outdoors the
 * dragon, drawn facing right.
 */
const foeGrid = (kind: FightKind, zone: Zone, lunge = false): Grid => {
  const frame = (monster: Monster): Sprite => (lunge ? monster.lunge : monster.still)
  if (kind === 'lint') return spriteGrid(frame(SPIDER))
  const room = ROOM_FOE[zone]
  return room === undefined ? mirrorGrid(spriteGrid(frame(DRAGON))) : spriteGrid(frame(room))
}

/**
 * How far a zone change has gone, in pixels of a scene `width` pixels wide:
 * the old scene that far out to the left, the new one that far in from the
 * right. The backdrop and what stands by the road both slide by it.
 */
export const slideShift = (width: number, progress: number): number => Math.round(width * Math.max(0, Math.min(1, progress)))

/**
 * Two landscapes side by side, `progress` of the way from the first to the
 * second: the first slides out to the left as the second comes in from the right.
 */
export const slide = (from: Grid, to: Grid, progress: number): Canvas => {
  const width = to[0]?.length ?? 0
  const shift = slideShift(width, progress)
  return to.map((line, y) => line.map((color, x) => (x + shift < width ? from[y]?.[x + shift] : to[y]?.[x + shift - width]) ?? color))
}

/** Something standing by the road, in art pixels: its left edge, and the columns it may paint (`to` excluded). */
export type Roadside = { grid: Grid; x: number; from: number; to: number }

/**
 * What stands by the road in a layout — the zone's landmarks, and the chest
 * once there is loot, just left of them — at `step` of the walk: it passes by
 * with the near layer, behind everyone, and comes round again from the right.
 * At rest it stands at the right, where the layout keeps room for it. `right`
 * is where it ends on the left, in units, at rest: the allies stand left of it.
 */
const roadsideOf = (kept: Layout, width: number, step: number): { things: Array<{ grid: Grid; x: number }>; right: number } => {
  const standing: Array<{ grid: Grid; x: number; size: number }> = []
  let right = width - 2
  for (const prop of [...kept.props].reverse()) {
    const size = units(PROPS[prop])
    right -= size
    standing.push({ grid: spriteGrid(PROPS[prop]), x: right, size })
  }
  if ((kept.extras.loot ?? 0) > 0) {
    right -= SIZE.extra + EXTRA_GAP
    standing.push({ grid: spriteGrid(CHEST), x: right, size: SIZE.extra })
  }
  const passed = step * PARALLAX.near
  const loop = width + (width - 2 - right) + LANDMARK_GAP
  const things = standing
    .map(thing => ({ grid: thing.grid, x: ((((thing.x - passed + thing.size) % loop) + loop) % loop) - thing.size }))
    .filter(thing => thing.x < width)
    .map(thing => ({ grid: thing.grid, x: thing.x * ART_SCALE }))
  return { things, right }
}

/**
 * The roadside a frame draws. It is scenery, so in a zone change it slides
 * with its backdrop: the old zone's out to the left, kept left of the seam,
 * and the new zone's in from the right, kept right of it — by `slideShift`,
 * the backdrop's own offset.
 */
export const roadside = (args: SceneArgs): Roadside[] => {
  const width = Math.max(0, Math.floor(args.columns))
  const pixels = width * ART_SCALE
  const step = (args.motion ?? REST).step
  const own = (zone: Zone): Array<{ grid: Grid; x: number }> => roadsideOf(layout({ ...args, columns: width, zone }), width, step).things
  const { transition } = args
  if (transition === undefined || transition.from === args.zone || transition.progress >= 1) {
    return own(args.zone).map(thing => ({ ...thing, from: 0, to: pixels }))
  }
  const seam = pixels - slideShift(pixels, transition.progress)
  return [
    ...own(transition.from).map(thing => ({ ...thing, x: thing.x - (pixels - seam), from: 0, to: seam })),
    ...own(args.zone).map(thing => ({ ...thing, x: thing.x + seam, from: seam, to: pixels })),
  ]
}

/**
 * Where the party stands in a frame, in units: the allies by the roadside,
 * the ghosts behind, the flags, the mascot, the monsters (nearest first, each
 * with its sprite) and the wizard — everything `sceneArt` draws after the
 * roadside, for one zone's layout.
 */
export type Party = {
  hero: number
  road: number
  allies: Array<{ kind: 'octopus' | 'fox'; grid: Grid; x: number }>
  ghosts: number[]
  flags: Array<{ state: Waypoint; x: number }>
  mascot: number
  foes: Array<FoeOnRoad & { grid: Grid }>
}

/** The party as a zone lays it out: `layout`, `figures` and `placeFoes`, in the scene's own order. */
export const party = (args: SceneArgs): Party => {
  const { zone, waypoints, companions, foes = NO_FOES, motion = REST } = args
  const width = Math.max(0, Math.floor(args.columns))
  const kept = layout({ ...args, columns: width })

  // GitHub's Octocat and GitLab's fox joined the party: they keep their places as it walks.
  let right = roadsideOf(kept, width, motion.step).right
  const allies = allyGrids(kept.extras, motion.hop).map(({ kind, grid }) => {
    right -= (grid[0]?.length ?? 0) / ART_SCALE + EXTRA_GAP
    return { kind, grid, x: right }
  })

  const flags = fitWaypoints(waypoints, flagSlots(kept.flagRoad))
  const placed = figures(flags, kept)
  const hero = Math.max(placed.hero, FAMILIAR_BEHIND)

  // Ghosts behind everything on the road, the farthest first; one with no room is not drawn: the pane's text names it.
  const ghosts: number[] = []
  for (let k = Math.min(companions, MAX_GHOSTS); k >= 1; k--) {
    const x = hero - FAMILIAR_BEHIND - GHOST_STEP * k
    if (x >= -4) ghosts.push(x)
  }

  return {
    hero,
    road: kept.road,
    allies,
    ghosts,
    flags: flags.map((state, i) => ({ state, x: placed.flagXs[i] ?? 0 })),
    mascot: hero - FAMILIAR_BEHIND,
    foes: placeFoes(hero, kept.road, placed.ahead, foes).map(foe => ({ ...foe, grid: foeGrid(foe.kind, zone, motion.lunge === true) })),
  }
}

/** Paints a sprite's grid with its feet on the ground, its left edge at `x` units. */
const standAt = (art: Canvas, grid: Grid, x: number): void => stamp(art, grid, x * ART_SCALE, GROUND_ROW * ART_SCALE - grid.length)

/**
 * The scene at the art's own resolution, ART_SCALE pixels a unit: what an
 * Image shows, where the terminal draws pixels. The landscape `motion.step`
 * steps along, the wizard in his pose, the mascot hopping or not.
 */
export const sceneArt = (args: SceneArgs): Grid => {
  const { columns, zone, motion = REST, transition, cells = false } = args
  const width = Math.max(0, Math.floor(columns))
  const backdrop = (z: Zone): Grid => rgbToGrid(rasterize(landscape(z, width, motion.step), width, SCENE_HEIGHT, ART_SCALE, 0, { pixel: true, bands: 5, ditherRows: cells ? 2 : 1 }))
  const art: Canvas = transition !== undefined && transition.from !== zone && transition.progress < 1
    ? slide(backdrop(transition.from), backdrop(zone), transition.progress)
    : backdrop(zone).map(row => [...row])
  for (const thing of roadside(args)) stamp(art, thing.grid, thing.x, GROUND_ROW * ART_SCALE - thing.grid.length, thing.from, thing.to)
  drawParty(art, partyAt(args), motion)

  return art
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

/** Whether two lists hold the same things in the same order, by `key`: then each can walk to its new place. */
const sameBy = <T>(a: readonly T[], b: readonly T[], key: (item: T) => string): boolean =>
  a.length === b.length && a.every((item, i) => key(item) === key(b[i] as T))

/**
 * The party `progress` of the way from one zone's layout to another's: the
 * wizard, the mascot, and the ghosts, flags, monsters and allies that are the
 * same in both walk from their old places to their new ones; a set that
 * differs — more or fewer flags, the spider in only one, an ally given way —
 * swaps at the halfway frame, and so does a room's monster.
 */
export const glide = (from: Party, to: Party, progress: number): Party => {
  const p = Math.max(0, Math.min(1, progress))
  const half = p < 0.5 ? from : to
  return {
    hero: lerp(from.hero, to.hero, p),
    road: half.road,
    allies: sameBy(from.allies, to.allies, ally => ally.kind)
      ? from.allies.map((ally, i) => ({ ...ally, x: lerp(ally.x, to.allies[i]?.x ?? ally.x, p) }))
      : half.allies,
    ghosts: from.ghosts.length === to.ghosts.length ? from.ghosts.map((x, i) => lerp(x, to.ghosts[i] ?? x, p)) : half.ghosts,
    flags: sameBy(from.flags, to.flags, flag => flag.state)
      ? from.flags.map((flag, i) => ({ ...flag, x: lerp(flag.x, to.flags[i]?.x ?? flag.x, p) }))
      : half.flags,
    mascot: lerp(from.mascot, to.mascot, p),
    foes: sameBy(from.foes, to.foes, foe => foe.kind)
      ? from.foes.map((foe, i) => ({ ...foe, x: lerp(foe.x, to.foes[i]?.x ?? foe.x, p), grid: half.foes[i]?.grid ?? foe.grid }))
      : half.foes,
  }
}

/** The party a frame draws: its zone's layout, or in a zone change the glide from the old zone's to it. */
export const partyAt = (args: SceneArgs): Party => {
  const { transition } = args
  return transition === undefined || transition.from === args.zone || transition.progress >= 1
    ? party(args)
    : glide(party({ ...args, zone: transition.from }), party(args), transition.progress)
}

/** Paints the party over the scene, back to front: allies, ghosts, flags, the mascot, the monsters (the far one first), the wizard. */
const drawParty = (art: Canvas, at: Party, motion: Motion): void => {
  for (const ally of at.allies) standAt(art, ally.grid, ally.x)
  for (const x of at.ghosts) standAt(art, spriteGrid(GHOST), x)
  for (const flag of at.flags) standAt(art, spriteGrid(FLAG[flag.state]), flag.x)
  standAt(art, spriteGrid(motion.hop ? MASCOT.hop : MASCOT.still), at.mascot)
  // The monsters face the wizard from the right: the test's monster nearest, the
  // spider behind it, drawn first so the test's monster stands in front.
  for (const foe of [...at.foes].reverse()) standAt(art, foe.grid, foe.x)
  standAt(art, spriteGrid(WIZARD[motion.pose]), at.hero)
}

/**
 * The scene as columns × SCENE_HEIGHT pixels, one a unit: the art with each
 * block reduced to its most common colour, for text cells and the desktop's Svg.
 */
export const scene = (args: SceneArgs): Grid => downsample(sceneArt(args), ART_SCALE)

/** The band's portrait above the prompt, in cells: 10 columns by 3 rows. */
export const BAND = { columns: 10, rows: 3 } as const

/**
 * The band's portrait: an avatar drawn for the size, as art — 20 × 12, two
 * pixels a column and four a row, as the Road's art is. While the Road walks
 * it steps on every other frame, at rest between — the wizard casts, his hand
 * up and the orb flaring, Claude's mascot hops, the Octocat splays its
 * tentacles — and in a fight, as the Road's wizard strikes.
 */
export const bandPortrait = (pose: Pose = 'stand', avatar: Avatar = 'wizard'): Grid => {
  const { rest, active } = BAND_AVATARS[avatar]
  return spriteGrid(pose === 'walk1' || pose === 'walk3' || pose === 'strike' ? active : rest)
}

/** The colour a zone's scene starts with: its top-left pixel, the sky's or the wall's. */
export const skyColor = (zone: Zone): number => scene({ columns: 4, zone, waypoints: [], companions: 0 })[0]?.[0] ?? 0
