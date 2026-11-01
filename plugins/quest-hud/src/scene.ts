// The Road pane's scene, drawn from Kenney's 1-Bit Pack (src/art/sprites.ts):
// the zone's dark background with its scenery dim behind, its ground, its
// props, the task list as flags, the wizard beside the flag in progress, and
// ghosts behind it for the subagents at work. Pure: it returns a Grid, which
// the pane draws as a Raster, an Image or an Svg.
import type { FightKind, Foes, Task, Zone } from '../types'
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
type Prop = SpriteName | readonly [SpriteName, number]

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
export type Extras = { loot?: number }

/** The gathered things' sprites, right to left: the chest once there is loot. */
const extraSprites = ({ loot = 0 }: Extras): SpriteName[] => (loot > 0 ? ['chest'] : [])

/** Pixels between gathered things, and between them and the props. */
const EXTRA_GAP = 2

/** The road's width: the span left of the props, and of what the session gathered, where flags and figures go. */
export const roadWidth = (columns: number, zone: Zone, extras: Extras = {}): number =>
  Math.max(0, Math.floor(columns) - propsWidth(zone) - extraSprites(extras).reduce((sum, name) => sum + SPRITES[name].width + EXTRA_GAP, 0))

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
  frame: 0 | 1
}

/**
 * Where the monster in place `index` of `count` starts: right of the wizard,
 * the first nearest. On a short road the ones behind close up, down to
 * FOE_PEEK pixels apart, and all of them move left as far as the wizard to
 * stay off the zone's props; past that they stand in front of the props.
 */
export const foeX = (hero: number, width: number, count: number, index: number): number => {
  const size = SPRITES.dragon.width
  const start = hero + SPRITES.wizard.width + FOE_GAP
  const pitch = count <= 1 ? size + FOE_GAP : Math.max(FOE_PEEK, Math.min(size + FOE_GAP, Math.floor((width - start - size) / (count - 1))))
  const first = Math.max(hero + SPRITES.wizard.width, Math.min(start, width - (count - 1) * pitch - size))
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
export const scene = ({ columns, zone, waypoints, companions, foes = NO_FOES, loot = 0, frame }: SceneArgs): Grid => {
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

  let right = width - 2
  for (const prop of [...backdrop.props].reverse()) {
    const grid = typeof prop === 'string' ? spriteGrid(prop) : spriteGrid(prop[0], () => prop[1])
    right -= grid[0]?.length ?? 0
    stamp(canvas, grid, right, GROUND_ROW - grid.length)
  }

  for (const name of extraSprites({ loot })) {
    const grid = spriteGrid(name)
    right -= (grid[0]?.length ?? 0) + EXTRA_GAP
    stamp(canvas, grid, right, GROUND_ROW - grid.length)
  }

  const road = roadWidth(width, zone, { loot })
  const flags = fitWaypoints(waypoints, flagSlots(road))
  const lift = frame === 1 ? -1 : 0
  const hero = avatarX(flags, road)
  const wizard = spriteGrid('wizard', () => WIZARD_COLOR)
  const ghost = spriteGrid('ghost', () => mix(GHOST, backdrop.background, 0.55))

  // Ghosts first, so the flags in front of them stay visible; the wizard last.
  for (let k = Math.min(companions, MAX_GHOSTS); k >= 1; k--) {
    stamp(canvas, ghost, hero - GHOST_STEP * k, GROUND_ROW - ghost.length + lift)
  }

  flags.forEach((state, i) => {
    const flag = flagGrid(state)
    stamp(canvas, flag, waypointX(i, flags.length, road), GROUND_ROW - flag.length)
  })

  // The monsters face the wizard from the right: the dragon nearest, the spider
  // behind it, drawn first so the dragon stands in front.
  const up = (['test', 'lint'] as const).filter(kind => foes[kind] !== 'none')
  for (let i = up.length - 1; i >= 0; i--) {
    const foe = foeGrid(up[i] as FightKind)
    const x = foeX(hero, road, up.length, i)
    const y = GROUND_ROW - foe.length + lift
    outline(canvas, foe, x, y, backdrop.background)
    stamp(canvas, foe, x, y)
  }

  stamp(canvas, wizard, hero, GROUND_ROW - wizard.length + lift)

  return canvas
}
