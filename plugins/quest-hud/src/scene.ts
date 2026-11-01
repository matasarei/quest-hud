// The Road pane's scene, drawn from Kenney's 1-Bit Pack (src/art/sprites.ts):
// the zone's dark background with its scenery dim behind, its ground, its
// props, the task list as flags, the wizard beside the flag in progress, and
// ghosts behind it for the subagents at work. Pure: it returns a Grid, which
// the pane draws as a Raster, an Image or an Svg.
import type { Allies, FightKind, Foes, Task, Zone } from '../types'
import { SPRITES, type SpriteName } from './art/sprites'
import { mapToGrid, type Grid } from './avatar'

/** Pixel rows: fourteen terminal rows of half blocks. */
export const SCENE_HEIGHT = 28
/** Where the ground starts: 16 px figures stand on it, with the background above. */
export const GROUND_ROW = 24
/** More tasks than this share flags. */
export const MAX_FLAGS = 12
/** More subagents than this are counted in the pane's text, not drawn. */
export const MAX_GHOSTS = 4
/** Flags are drawn at half the pack's size, so they line the road without crowding the figures. */
export const FLAG_WIDTH = Math.ceil(SPRITES.flag.width / 2)
/** Pixels a flag takes, with the gap to the next one. */
export const FLAG_SLOT = FLAG_WIDTH + 3
/** Pixels between ghosts trailing the wizard. */
const GHOST_STEP = 10
/** How far the scenery behind stands above the ground line. */
const FAR_RISE = 4
/** How much the scenery behind fades into the background. */
const FAR_FADE = 0.72

export type Waypoint = 'done' | 'now' | 'todo'

/** A prop: a sprite in the pack's own colour, or in one given here. */
export type Prop = SpriteName | readonly [SpriteName, number]

type Backdrop = {
  /** The dark colour behind everything; every zone has its own. */
  background: number
  /** Scenery far behind, faded toward the background, repeated across in turn. */
  far: readonly SpriteName[]
  /** The ground band's colour. */
  ground: number
  /** A tile whose top rows lie on the ground band, lightly. */
  texture: SpriteName
  /** Standing on the ground at the right, left to right. */
  props: readonly Prop[]
}

/** Each zone's scene. */
export const BACKDROPS: Readonly<Record<Zone, Backdrop>> = {
  watchtower: { background: 0x1b2733, far: ['pine', 'roundTree', 'pine'], ground: 0x2b3a2a, texture: 'grassTexture', props: ['pine', ['tower', 0xd8d0c0]] },
  harbour: { background: 0x10243a, far: ['palm'], ground: 0x1f4a6e, texture: 'water', props: ['chest', 'key'] },
  dungeon: { background: 0x14121a, far: ['redWall', 'brickWall'], ground: 0x2c2833, texture: 'dirt', props: ['cobweb', ['tombstone', 0xbdb6a8], 'skull', 'torch'] },
  arena: { background: 0x2e2418, far: ['redWall'], ground: 0x5a4a38, texture: 'dirt', props: ['shield', 'sword'] },
  forge: { background: 0x2a1414, far: ['brickWall', 'redWall'], ground: 0x3a2a22, texture: 'dirt', props: [['axe', 0xc9ced6], 'campfire', 'redWall'] },
  map: { background: 0x23201a, far: ['bookshelf', 'bookcase'], ground: 0x3a3022, texture: 'dirt', props: ['candelabra', 'table', 'potion'] },
  camp: { background: 0x1d2240, far: ['pine', 'twinPines', 'pine', 'pineLayered'], ground: 0x3b2f24, texture: 'dirt', props: ['tent', 'campfire'] },
  wilds: { background: 0x13261d, far: ['oak', 'roundTree', 'twinPines'], ground: 0x2b3a22, texture: 'grassTexture', props: ['oak', 'grass', 'pine'] },
}

/** The flag's colour in each state. */
const CLOTH: Readonly<Record<Waypoint, number>> = { done: 0x4fd37a, now: 0xf2d15b, todo: 0x8a8fa3 }
/** The wizard's colour: the pack draws its figures in one beige; ours is purple. */
export const WIZARD_COLOR = 0xb18cff
const GHOST = 0xbfe3ff
/** The monsters' colours: the dragon of a test run, the spider of a lint run. */
export const FOE_COLOR: Readonly<Record<FightKind, number>> = { test: 0xe2643a, lint: 0xc94a5c }
/** Pixels between the wizard and the first monster, and between monsters. */
const FOE_GAP = 2
/** The least a monster behind another shows of itself, in pixels, when the road is short. */
const FOE_PEEK = 10
const NO_FOES: Foes = { test: 'none', lint: 'none' }

const channel = (color: number, shift: number): number => (color >> shift) & 0xff
const rgb = (r: number, g: number, b: number): number =>
  (Math.min(255, Math.round(r)) << 16) | (Math.min(255, Math.round(g)) << 8) | Math.min(255, Math.round(b))

/** `a` moved `amount` of the way toward `b`. */
const mix = (a: number, b: number, amount: number): number =>
  rgb(
    channel(a, 16) + (channel(b, 16) - channel(a, 16)) * amount,
    channel(a, 8) + (channel(b, 8) - channel(a, 8)) * amount,
    channel(a, 0) + (channel(b, 0) - channel(a, 0)) * amount,
  )

/** A sprite's pixels, each colour passed through `paint`. */
const spriteGrid = (name: SpriteName, paint: (color: number) => number = color => color): Grid =>
  mapToGrid(SPRITES[name].map, SPRITES[name].palette).map(line => line.map(color => (color === undefined ? undefined : paint(color))))

/** Half the size: every other pixel of every other row. */
export const half = (grid: Grid): Grid => grid.filter((_, y) => y % 2 === 0).map(line => line.filter((_, x) => x % 2 === 0))

/** The flag in a state, at half size, all in the state's colour. */
const flagGrid = (state: Waypoint): Grid => half(spriteGrid('flag', () => CLOTH[state]))

/** A zone's background colour: the scene's top-left pixel. */
export const skyColor = (zone: Zone): number => BACKDROPS[zone].background

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

const propName = (prop: Prop): SpriteName => (typeof prop === 'string' ? prop : prop[0])

/** The pixels the zone's props take at the right, with their margin. */
export const propsWidth = (zone: Zone): number =>
  BACKDROPS[zone].props.reduce((sum, prop) => sum + SPRITES[propName(prop)].width, 0) + 4

/** What the session gathered, standing left of the zone's props. */
export type Extras = { loot?: number; allies?: Allies }

/** The allies' colours: a pale violet octopus for gh, an orange fox for glab. */
export const ALLY_COLOR = { octopus: 0xddd0ff, fox: 0xf5a04a } as const

/**
 * The gathered things, right to left: the chest once there is loot, then
 * the octopus and the fox once they came; the fox mirrored to face the road.
 */
const extraGrids = ({ loot = 0, allies }: Extras): Grid[] => [
  ...(loot > 0 ? [spriteGrid('chest')] : []),
  ...(allies?.octopus ? [spriteGrid('octopus', () => ALLY_COLOR.octopus)] : []),
  ...(allies?.fox ? [spriteGrid('fox', () => ALLY_COLOR.fox).map(line => [...line].reverse())] : []),
]

/** Pixels between gathered things, and between them and the props. */
const EXTRA_GAP = 2

/** The road's width: the span left of the props, and of what the session gathered, where flags and figures go. */
export const roadWidth = (columns: number, zone: Zone, extras: Extras = {}): number =>
  Math.max(0, Math.floor(columns) - propsWidth(zone) - extraGrids(extras).reduce((sum, grid) => sum + (grid[0]?.length ?? 0) + EXTRA_GAP, 0))

/** How many flags fit across a road of `width` pixels. */
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

const stamp = (canvas: Array<Array<number | undefined>>, grid: Grid, x: number, y: number): void => {
  grid.forEach((line, dy) => {
    const row = canvas[y + dy]
    if (!row) return
    line.forEach((color, dx) => {
      if (color !== undefined && x + dx >= 0 && x + dx < row.length) row[x + dx] = color
    })
  })
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
  /** The octopus and the fox; neither when left out. */
  allies?: Allies
  frame: 0 | 1
}

/** The flags a road keeps room for, when there are that many tasks: the one in progress and one each side. */
export const MIN_FLAGS = 3

/**
 * What a scene keeps on a pane of its width: the zone's props, what the
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
    return { flagXs: flags.map((_, i) => waypointX(i, flags.length, flagRoad)), hero, ahead: hero + SPRITES.wizard.width }
  }
  const now = flags.indexOf('now')
  const at = now >= 0 ? now : flags.indexOf('todo') >= 0 ? flags.indexOf('todo') : flags.length - 1
  const packedHero = 2 + at * FLAG_SLOT + FLAG_WIDTH
  const flagXs = flags.map((_, i) => (i <= at ? 2 + i * FLAG_SLOT : packedHero + SPRITES.wizard.width + 1 + (i - at - 1) * FLAG_SLOT))
  const last = flagXs[flagXs.length - 1] ?? 0
  return { flagXs, hero: packedHero, ahead: Math.max(packedHero + SPRITES.wizard.width, at < flags.length - 1 ? last + FLAG_WIDTH + 1 : 0) }
}

/** The road left of these props and gathered things. */
const roadLeft = (columns: number, props: readonly Prop[], extras: Extras): number =>
  Math.max(0, Math.floor(columns) - props.reduce((sum, prop) => sum + SPRITES[propName(prop)].width, 0) - 4
    - extraGrids(extras).reduce((sum, grid) => sum + (grid[0]?.length ?? 0) + EXTRA_GAP, 0))

/** The span MIN_FLAGS flags take packed at the left: as few as there are tasks. */
const packedFlagRoad = (waypoints: readonly Waypoint[]): number => 4 + Math.min(waypoints.length, MIN_FLAGS) * FLAG_SLOT

/**
 * Whether a road `width` pixels wide, its flags spread over `flagRoad`, has
 * room for what it must show: the flags up to MIN_FLAGS, and the wizard with
 * every monster that is up beside it, each at full width.
 */
export const roadFits = (width: number, laid: Pick<Layout, 'flagRoad' | 'isPacked'>, waypoints: readonly Waypoint[], foes: Foes): boolean => {
  const flags = fitWaypoints(waypoints, flagSlots(laid.flagRoad))
  if (flags.length < Math.min(waypoints.length, MIN_FLAGS)) return false
  const up = (['test', 'lint'] as const).filter(kind => foes[kind] !== 'none').length
  const { ahead } = figures(flags, laid)
  return ahead + up * (FOE_GAP + SPRITES.dragon.width) <= width
}

/**
 * What the scene keeps: everything when the road has room, else things give
 * way one at a time until it does — the zone's props from the left, keeping
 * its last; then the fox, the octopus and the chest; then that last prop.
 * A thing gives way only when even the flags packed at the left leave no room.
 */
export const layout = ({ columns, zone, waypoints, foes = NO_FOES, loot = 0, allies }: Pick<SceneArgs, 'columns' | 'zone' | 'waypoints' | 'foes' | 'loot' | 'allies'>): Layout => {
  let props: readonly Prop[] = BACKDROPS[zone].props
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
 * FOE_PEEK pixels apart, and all of them move left as far as the wizard to
 * stay off the zone's props; past that they stand in front of the props.
 */
export const foeX = (hero: number, width: number, count: number, index: number, ahead = hero + SPRITES.wizard.width): number => {
  const size = SPRITES.dragon.width
  const start = ahead + FOE_GAP
  const pitch = count <= 1 ? size + FOE_GAP : Math.max(FOE_PEEK, Math.min(size + FOE_GAP, Math.floor((width - start - size) / (count - 1))))
  const first = Math.max(ahead, Math.min(start, width - (count - 1) * pitch - size))
  return first + index * pitch
}

/**
 * Paints a one-pixel ring around a sprite's pixels in `color`, above the
 * ground line only, so a figure stands clear of whatever is behind it.
 */
const outline = (canvas: Array<Array<number | undefined>>, grid: Grid, x: number, y: number, color: number): void => {
  const isSet = (gx: number, gy: number): boolean => grid[gy]?.[gx] !== undefined
  grid.forEach((line, gy) => line.forEach((pixel, gx) => {
    if (pixel === undefined) return
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const row = canvas[y + gy + dy]
      if (isSet(gx + dx, gy + dy) || !row || y + gy + dy >= GROUND_ROW || x + gx + dx < 0 || x + gx + dx >= row.length) continue
      row[x + gx + dx] = color
    }
  }))
}

/** A monster facing left, towards the wizard: the dragon is drawn facing right, so it is mirrored. */
const foeGrid = (kind: FightKind): Grid =>
  kind === 'test'
    ? spriteGrid('dragon', () => FOE_COLOR.test).map(line => [...line].reverse())
    : spriteGrid('spider', () => FOE_COLOR.lint)

/**
 * The scene as columns × SCENE_HEIGHT pixels: the waypoints are fitted to the
 * flags the road has room for. Frame 1 lifts the figures a pixel: the bob.
 */
export const scene = ({ columns, zone, waypoints, companions, foes = NO_FOES, loot = 0, allies, frame }: SceneArgs): Grid => {
  const width = Math.max(0, Math.floor(columns))
  const backdrop = BACKDROPS[zone]
  // Under everything: the background above the ground line, the ground below it.
  const canvas = Array.from({ length: SCENE_HEIGHT }, (_, y) =>
    Array<number | undefined>(width).fill(y < GROUND_ROW ? backdrop.background : backdrop.ground),
  )

  for (let x = 0, i = 0; x < width; i++) {
    const name = backdrop.far[i % backdrop.far.length] ?? 'pine'
    const far = spriteGrid(name, color => mix(color, backdrop.background, FAR_FADE))
    stamp(canvas, far, x, GROUND_ROW - far.length - FAR_RISE)
    x += 14 + (i % 3) * 3
  }

  const texture = spriteGrid(backdrop.texture, color => mix(color, backdrop.ground, 0.4)).slice(0, SCENE_HEIGHT - GROUND_ROW)
  for (let x = 0; x < width; x += texture[0]?.length ?? width) stamp(canvas, texture, x, GROUND_ROW)

  const kept = layout({ columns: width, zone, waypoints, foes, loot, ...(allies === undefined ? {} : { allies }) })

  let right = width - 2
  for (const prop of [...kept.props].reverse()) {
    const grid = typeof prop === 'string' ? spriteGrid(prop) : spriteGrid(prop[0], () => prop[1])
    right -= grid[0]?.length ?? 0
    stamp(canvas, grid, right, GROUND_ROW - grid.length)
  }

  for (const grid of extraGrids(kept.extras)) {
    right -= (grid[0]?.length ?? 0) + EXTRA_GAP
    stamp(canvas, grid, right, GROUND_ROW - grid.length)
  }

  const road = kept.road
  const flags = fitWaypoints(waypoints, flagSlots(kept.flagRoad))
  const lift = frame === 1 ? -1 : 0
  const { flagXs, hero, ahead } = figures(flags, kept)
  const wizard = spriteGrid('wizard', () => WIZARD_COLOR)
  const ghost = spriteGrid('ghost', () => mix(GHOST, backdrop.background, 0.55))

  // Ghosts first, so the flags in front of them stay visible; the wizard last.
  // One with no room left of the wizard is not drawn: the pane's text names it.
  for (let k = Math.min(companions, MAX_GHOSTS); k >= 1; k--) {
    if (hero - GHOST_STEP * k >= 0) stamp(canvas, ghost, hero - GHOST_STEP * k, GROUND_ROW - ghost.length + lift)
  }

  flags.forEach((state, i) => {
    const flag = flagGrid(state)
    stamp(canvas, flag, flagXs[i] ?? 0, GROUND_ROW - flag.length)
  })

  // The monsters face the wizard from the right: the dragon nearest, the spider
  // behind it, drawn first so the dragon stands in front.
  const up = (['test', 'lint'] as const).filter(kind => foes[kind] !== 'none')
  for (let i = up.length - 1; i >= 0; i--) {
    const foe = foeGrid(up[i] as FightKind)
    const x = foeX(hero, road, up.length, i, ahead)
    const y = GROUND_ROW - foe.length + lift
    outline(canvas, foe, x, y, backdrop.background)
    stamp(canvas, foe, x, y)
  }

  stamp(canvas, wizard, hero, GROUND_ROW - wizard.length + lift)

  return canvas
}
