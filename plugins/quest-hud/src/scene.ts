// The Road pane's scene, drawn from the pack's sprites (src/art/sprites.ts):
// the zone's hills and sky over its ground, the zone's props, the task list as
// flags, the pink astronaut beside the flag in progress, and subagents as
// tinted astronauts behind it. Pure: it returns a Grid, which the pane draws
// as a Raster, an Image or an Svg.
import type { Task, Zone } from '../types'
import { SPRITES, type SpriteName } from './art/sprites'
import { mapToGrid, type Grid } from './avatar'

/** Pixel rows: fourteen terminal rows of half blocks. */
export const SCENE_HEIGHT = 28
/** Where the ground starts: the hills fill the 24 rows above it. */
export const GROUND_ROW = 24
/** More tasks than this share flags. */
export const MAX_FLAGS = 12
/** More subagents than this are counted in the pane's text, not drawn. */
export const MAX_GHOSTS = 4
/** Flags and ghosts are drawn at half the pack's size, so the astronaut stands out among them. */
export const FLAG_WIDTH = Math.ceil(SPRITES.flag.width / 2)
/** Pixels a flag takes, with the gap to the next one. */
export const FLAG_SLOT = FLAG_WIDTH + 3
/** Pixels between ghosts trailing the astronaut. */
const GHOST_STEP = 11

export type Waypoint = 'done' | 'now' | 'todo'

type Shade = readonly [number, number, number]
type Backdrop = {
  /** The hills-and-sky tiles, repeated across in turn. */
  hills: readonly SpriteName[]
  /** Each channel of the hills is multiplied by these: three biomes make eight zones. */
  shade: Shade
  /** The tile whose top rows are the ground line. */
  ground: SpriteName
  /** Standing on the ground at the right, left to right. */
  props: readonly SpriteName[]
}

/** Each zone's backdrop: the pack has three biomes, shaded apart so every sky differs. */
export const BACKDROPS: Readonly<Record<Zone, Backdrop>> = {
  watchtower: { hills: ['winterA', 'winterB'], shade: [1, 1, 1], ground: 'snow', props: ['pine', 'ladder'] },
  harbour: { hills: ['winterC'], shade: [0.82, 0.92, 1], ground: 'water', props: ['bridgeLeft', 'bridgeMid', 'bridgeRight'] },
  dungeon: { hills: ['forestA', 'forestB'], shade: [0.34, 0.32, 0.42], ground: 'dirt', props: ['brickCross', 'door', 'key'] },
  arena: { hills: ['desertA', 'desertB'], shade: [1, 1, 1], ground: 'sand', props: ['spikes', 'brick', 'spikes'] },
  forge: { hills: ['desertB', 'desertA'], shade: [0.9, 0.62, 0.5], ground: 'dirt', props: ['crate', 'brick', 'lever'] },
  map: { hills: ['forestA', 'forestB'], shade: [1, 1, 1], ground: 'grass', props: ['sign', 'arrow'] },
  camp: { hills: ['forestB', 'forestA'], shade: [1, 0.82, 0.62], ground: 'grass', props: ['mushroom', 'sprout', 'mushroom'] },
  wilds: { hills: ['forestB'], shade: [0.88, 1, 0.88], ground: 'grass', props: ['bush', 'pine', 'sprout'] },
}

/** The flag's cloth in each state; the pack's flag is red, recoloured by its red shades. */
const CLOTH: Readonly<Record<Waypoint, number>> = { done: 0x4fd37a, now: 0xf2d15b, todo: 0x8a8fa3 }
const GHOST_TINT = 0x9fd8ff

const channel = (color: number, shift: number): number => (color >> shift) & 0xff
const rgb = (r: number, g: number, b: number): number =>
  (Math.min(255, Math.round(r)) << 16) | (Math.min(255, Math.round(g)) << 8) | Math.min(255, Math.round(b))

const shaded = (color: number, [r, g, b]: Shade): number => rgb(channel(color, 16) * r, channel(color, 8) * g, channel(color, 0) * b)

/** A sprite's pixels, each colour passed through `paint`. */
const spriteGrid = (name: SpriteName, paint: (color: number) => number = color => color): Grid =>
  mapToGrid(SPRITES[name].map, SPRITES[name].palette).map(line => line.map(color => (color === undefined ? undefined : paint(color))))

/** Half the size: every other pixel of every other row. */
export const half = (grid: Grid): Grid => grid.filter((_, y) => y % 2 === 0).map(line => line.filter((_, x) => x % 2 === 0))

const isRed = (color: number): boolean => channel(color, 16) > channel(color, 8) + 60 && channel(color, 16) > channel(color, 0) + 60

/** The flag in a state, at half size: each red shade becomes the state's colour, as light as the red was. */
const flagGrid = (state: Waypoint): Grid =>
  half(spriteGrid('flag', color => {
    if (!isRed(color)) return color
    const light = channel(color, 16) / 255
    return rgb(channel(CLOTH[state], 16) * light, channel(CLOTH[state], 8) * light, channel(CLOTH[state], 0) * light)
  }))

const ghostly = (color: number): number =>
  rgb((channel(color, 16) + channel(GHOST_TINT, 16)) / 2, (channel(color, 8) + channel(GHOST_TINT, 8)) / 2, (channel(color, 0) + channel(GHOST_TINT, 0)) / 2)

/** The colour at the top-left of a zone's sky. */
export const skyColor = (zone: Zone): number => {
  const backdrop = BACKDROPS[zone]
  return spriteGrid(backdrop.hills[0] ?? 'forestA', color => shaded(color, backdrop.shade))[0]?.[0] ?? 0
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

/** The pixels the zone's props take at the right, with their margin. */
export const propsWidth = (zone: Zone): number =>
  BACKDROPS[zone].props.reduce((sum, name) => sum + SPRITES[name].width, 0) + 4

/** The road's width: the span left of the props where flags and figures go. */
export const roadWidth = (columns: number, zone: Zone): number => Math.max(0, Math.floor(columns) - propsWidth(zone))

/** How many flags fit across a road of `width` pixels. */
export const flagSlots = (width: number): number => Math.max(0, Math.floor((width - 4) / FLAG_SLOT))

/** The x a flag starts at: its share of the road, from a margin of 2. */
export const waypointX = (index: number, count: number, width: number): number =>
  Math.round(2 + (index * Math.max(0, width - 4)) / Math.max(1, count))

/**
 * Where the avatar's sprite starts: just right of the flag in progress, else
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
  frame: 0 | 1
}

/**
 * The scene as columns × SCENE_HEIGHT pixels: the waypoints are fitted to the
 * flags the width has room for. Frame 1 is the astronaut's step: the bob.
 */
export const scene = ({ columns, zone, waypoints, companions, frame }: SceneArgs): Grid => {
  const width = Math.max(0, Math.floor(columns))
  const backdrop = BACKDROPS[zone]
  const hills = backdrop.hills.map(name => spriteGrid(name, color => shaded(color, backdrop.shade)))
  // Under everything, the sky above the ground line and the hills' foot below
  // it, so a sprite's transparent pixels (the water's top rows) are never holes.
  const foot = hills[0]?.[GROUND_ROW - 1]?.[0] ?? skyColor(zone)
  const canvas = Array.from({ length: SCENE_HEIGHT }, (_, y) =>
    Array<number | undefined>(width).fill(y < GROUND_ROW ? skyColor(zone) : foot),
  )

  for (let x = 0, i = 0; x < width; i++) {
    const tile = hills[i % hills.length] ?? []
    stamp(canvas, tile, x, 0)
    x += tile[0]?.length ?? width
  }

  const ground = spriteGrid(backdrop.ground).slice(0, SCENE_HEIGHT - GROUND_ROW)
  for (let x = 0; x < width; x += ground[0]?.length ?? width) stamp(canvas, ground, x, GROUND_ROW)

  let right = width - 2
  for (const name of [...backdrop.props].reverse()) {
    const prop = spriteGrid(name)
    right -= prop[0]?.length ?? 0
    stamp(canvas, prop, right, GROUND_ROW - prop.length)
  }

  const road = roadWidth(width, zone)
  const flags = fitWaypoints(waypoints, flagSlots(road))
  const pose: SpriteName = frame === 1 ? 'astronautStep' : 'astronaut'
  const hero = avatarX(flags, road)
  const figure = spriteGrid(pose)
  const ghost = half(spriteGrid(pose, ghostly))

  // Ghosts first, so the flags in front of them stay visible; the astronaut last.
  for (let k = Math.min(companions, MAX_GHOSTS); k >= 1; k--) {
    stamp(canvas, ghost, hero - GHOST_STEP * k, GROUND_ROW - ghost.length)
  }

  flags.forEach((state, i) => {
    const flag = flagGrid(state)
    stamp(canvas, flag, waypointX(i, flags.length, road), GROUND_ROW - flag.length)
  })

  stamp(canvas, figure, hero, GROUND_ROW - figure.length)

  return canvas
}
