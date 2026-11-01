// The Road pane's scene: the zone's backdrop, the task list as waypoint flags,
// the avatar at the task in progress, and subagents as ghosts behind it. Pure:
// it returns a Grid, which the pane draws as a Raster or an Svg.
import type { Task, Zone } from '../types'
import { AVATAR, AVATAR_SMALL, MAGE, mapToGrid, type Grid, type Palette } from './avatar'

/** Pixel rows: eight terminal rows of half blocks. */
export const SCENE_HEIGHT = 16
/** Where the ground starts; the avatar's feet stand on the last row. */
export const GROUND_ROW = 13
/** More tasks than this share flags. */
export const MAX_FLAGS = 12
/** More subagents than this are counted in the pane's text, not drawn. */
export const MAX_GHOSTS = 4

export type Waypoint = 'done' | 'now' | 'todo'

type Prop = { map: readonly string[]; palette: Palette }
type Backdrop = { sky: number; ground: number; prop?: Prop; mortar?: number }

const PROPS: Readonly<Record<string, Prop>> = {
  anvil: { map: ['.e..e.', 'AAAAAA', '.AAAA.', '..AA..', '.AAAA.'], palette: { A: 0x6b7280, e: 0xff8a3d } },
  banner: { map: ['P...', 'PRRR', 'PRRR', 'PRR.', 'P...', 'P...'], palette: { P: 0xc9ced6, R: 0xd23a4e } },
  pier: { map: ['BBBBBBBBB', '.B.....B.'], palette: { B: 0x8a5a2b } },
  table: { map: ['.pppp.', 'TTTTTT', 'T....T', 'T....T'], palette: { p: 0xf1e6c8, T: 0x8a5a2b } },
  fire: { map: ['.y.', 'yoy', 'oRo', 'w.w'], palette: { y: 0xffe066, o: 0xff9d2e, R: 0xd23a1a, w: 0x8a5a2b } },
  tower: { map: ['tttt', 'tWWt', 'tttt', '.tt.', '.tt.', '.tt.', '.tt.', '.tt.', '.tt.'], palette: { t: 0x8b8f9c, W: 0xf2d15b } },
  tree: { map: ['.ggg.', 'ggggg', 'ggggg', '.ggg.', '..b..', '..b..'], palette: { g: 0x3f8f4a, b: 0x6b4220 } },
}

/** Each zone's sky, ground and one prop; every sky is its own colour. */
export const BACKDROPS: Readonly<Record<Zone, Backdrop>> = {
  watchtower: { sky: 0x2b3350, ground: 0x3b4a2f, prop: PROPS.tower },
  harbour: { sky: 0x1b3a5c, ground: 0x2a6f9e, prop: PROPS.pier },
  dungeon: { sky: 0x26222b, ground: 0x4a4450, mortar: 0x1b181f },
  arena: { sky: 0x3a2a3e, ground: 0x8a6d45, prop: PROPS.banner },
  forge: { sky: 0x3a1f1a, ground: 0x3d3530, prop: PROPS.anvil },
  map: { sky: 0x2e2a1f, ground: 0x5a4630, prop: PROPS.table },
  camp: { sky: 0x1c2433, ground: 0x2f4a2a, prop: PROPS.fire },
  wilds: { sky: 0x1f3326, ground: 0x2f5a2a, prop: PROPS.tree },
}

const FLAG: Readonly<Record<Waypoint, number>> = { done: 0x4fd37a, now: 0xf2d15b, todo: 0x8a8fa3 }
const POLE = 0xc9ced6
const GHOST_TINT = 0x9fd8ff

/** One waypoint per task, in order, at most MAX_FLAGS: the flag a task falls on takes its most urgent state. */
export const waypointsOf = (tasks: readonly Task[]): Waypoint[] => {
  const count = Math.min(tasks.length, MAX_FLAGS)
  const flags: Waypoint[] = Array<Waypoint>(count).fill('done')
  const rank: Readonly<Record<Waypoint, number>> = { done: 0, todo: 1, now: 2 }

  tasks.forEach((task, i) => {
    const flag = Math.floor((i * count) / tasks.length)
    const state: Waypoint = task.status === 'in_progress' ? 'now' : task.status === 'completed' ? 'done' : 'todo'
    if (rank[state] > rank[flags[flag] ?? 'done']) flags[flag] = state
  })

  return flags
}

/** The x of a waypoint's pole, spread evenly over the width with a margin of 2. */
export const waypointX = (index: number, count: number, columns: number): number =>
  Math.round(2 + ((index + 0.5) * Math.max(0, columns - 4)) / Math.max(1, count))

/**
 * Where the avatar's map starts: one pixel right of the pole of the flag in
 * progress, else of the first flag still to do; past the last flag when all
 * are done; at the left margin when there are none.
 */
export const avatarX = (waypoints: readonly Waypoint[], columns: number): number => {
  if (waypoints.length === 0) return 2
  const now = waypoints.indexOf('now')
  const index = now >= 0 ? now : waypoints.indexOf('todo')
  const at = index >= 0 ? index : waypoints.length - 1
  return waypointX(at, waypoints.length, columns) + 1
}

const tint = (color: number): number => {
  const mix = (shift: number) => (((color >> shift) & 0xff) + ((GHOST_TINT >> shift) & 0xff)) >> 1
  return (mix(16) << 16) | (mix(8) << 8) | mix(0)
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

/** The scene as columns × SCENE_HEIGHT pixels. Frame 1 lifts the figures by a pixel: the bob. */
export const scene = ({ columns, zone, waypoints, companions, frame }: SceneArgs): Grid => {
  const width = Math.max(0, Math.floor(columns))
  const backdrop = BACKDROPS[zone]
  const canvas = Array.from({ length: SCENE_HEIGHT }, (_, y) =>
    Array<number | undefined>(width).fill(y >= GROUND_ROW ? backdrop.ground : backdrop.sky),
  )

  if (backdrop.mortar !== undefined) {
    for (let y = 2; y < GROUND_ROW; y += 3) canvas[y]?.fill(backdrop.mortar)
  }

  if (backdrop.prop) {
    const prop = mapToGrid(backdrop.prop.map, backdrop.prop.palette)
    stamp(canvas, prop, width - (prop[0]?.length ?? 0) - 2, GROUND_ROW - prop.length)
  }

  waypoints.forEach((state, i) => {
    const x = waypointX(i, waypoints.length, width)
    for (let y = GROUND_ROW - 4; y < GROUND_ROW; y++) stamp(canvas, [[POLE]], x, y)
    stamp(canvas, [[FLAG[state], FLAG[state]], [FLAG[state], FLAG[state]]], x + 1, GROUND_ROW - 4)
  })

  const lift = frame === 1 ? -1 : 0
  const hero = avatarX(waypoints, width)
  const ghost = mapToGrid(AVATAR_SMALL, MAGE).map(line => line.map(color => (color === undefined ? undefined : tint(color))))

  for (let k = 0; k < Math.min(companions, MAX_GHOSTS); k++) {
    stamp(canvas, ghost, hero - 7 * (k + 1), SCENE_HEIGHT - ghost.length + lift)
  }

  stamp(canvas, mapToGrid(AVATAR, MAGE), hero, SCENE_HEIGHT - AVATAR.length + lift)

  return canvas
}
