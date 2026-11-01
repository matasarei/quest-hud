import { describe, expect, test } from 'claude-code/testing'

import { SPRITES } from '../src/art/sprites'
import {
  avatarX, BACKDROPS, FLAG_WIDTH, fitWaypoints, flagSlots, GROUND_ROW, half, MAX_FLAGS, MAX_GHOSTS, roadWidth, scene,
  SCENE_HEIGHT, skyColor, waypointsOf, waypointX, WIZARD_COLOR, type Waypoint,
} from '../src/scene'
import type { Task, Zone } from '../types'

const ZONES: readonly Zone[] = ['watchtower', 'harbour', 'dungeon', 'arena', 'forge', 'map', 'camp', 'wilds']

const task = (id: string, status: Task['status']): Task => ({ id, subject: id, status })

/** Whether the purple wizard shows in the grid at (x, y): every pixel of its sprite that falls inside. */
const wizardAt = (grid: ReturnType<typeof scene>, x: number, y: number): boolean =>
  SPRITES.wizard.map.every((line, dy) =>
    [...line].every((c, dx) => c === '.' || y + dy < 0 || y + dy >= grid.length || x + dx >= (grid[0]?.length ?? 0) || grid[y + dy]?.[x + dx] === WIZARD_COLOR),
  )

const red = (c: number | undefined) => c !== undefined && ((c >> 16) & 255) > ((c >> 8) & 255) + 60 && ((c >> 16) & 255) > (c & 255) + 60

describe('waypointsOf and fitWaypoints', () => {
  test('one flag per task, in order, with its state', () => {
    expect(waypointsOf([task('a', 'completed'), task('b', 'in_progress'), task('c', 'pending')])).toEqual(['done', 'now', 'todo'])
  })

  test('no tasks, no flags; no room, no flags', () => {
    expect(waypointsOf([])).toEqual([])
    expect(fitWaypoints(['done', 'now'], 0)).toEqual([])
  })

  test('more tasks than flags share them, and a shared flag shows the most urgent state', () => {
    const tasks = Array.from({ length: 30 }, (_, i) => task(String(i), i < 10 ? 'completed' : i === 10 ? 'in_progress' : 'pending'))
    const flags = waypointsOf(tasks)
    expect(flags).toHaveLength(MAX_FLAGS)
    expect(flags.filter(f => f === 'now')).toHaveLength(1)
    expect(flags[0]).toBe('done')
    expect(flags[MAX_FLAGS - 1]).toBe('todo')
    expect(fitWaypoints(['done', 'now', 'todo', 'todo'], 2)).toEqual(['now', 'todo'])
  })
})

describe('the road', () => {
  test('the props keep their space at the right; flags fit what is left', () => {
    expect(roadWidth(120, 'camp')).toBe(120 - (SPRITES.tent.width + SPRITES.campfire.width + 4))
    expect(flagSlots(roadWidth(120, 'camp')) > 0).toBe(true)
    expect(flagSlots(4)).toBe(0)
  })

  test('the wizard starts just right of the flag in progress, else the first to do, else the last', () => {
    expect(avatarX(['done', 'now', 'todo'], 80)).toBe(waypointX(1, 3, 80) + FLAG_WIDTH)
    expect(avatarX(['done', 'todo', 'todo'], 80)).toBe(waypointX(1, 3, 80) + FLAG_WIDTH)
    expect(avatarX(['done', 'done'], 80)).toBe(waypointX(1, 2, 80) + FLAG_WIDTH)
    expect(avatarX([], 80)).toBe(2)
  })
})

describe('scene', () => {
  const three: Waypoint[] = ['done', 'now', 'todo']

  test('is columns × SCENE_HEIGHT pixels, every pixel filled, in every zone', () => {
    for (const zone of ZONES) {
      const grid = scene({ columns: 90, zone, waypoints: three, companions: 1, frame: 0 })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === 90 && line.every(c => c !== undefined))).toBe(true)
    }
  })

  test('each zone has its own background, and the scene starts with it', () => {
    expect(new Set(ZONES.map(skyColor)).size).toBe(ZONES.length)
    for (const zone of ZONES) {
      expect(scene({ columns: 40, zone, waypoints: [], companions: 0, frame: 0 })[0]?.[0]).toBe(skyColor(zone))
    }
  })

  test('the ground band starts at GROUND_ROW: below it, no background shows', () => {
    for (const zone of ZONES) {
      const grid = scene({ columns: 60, zone, waypoints: three, companions: 2, frame: 0 })
      const below = grid.slice(GROUND_ROW).flat()
      expect(below.filter(c => c === BACKDROPS[zone].background)).toEqual([])
      expect(grid[GROUND_ROW]?.some(c => c === BACKDROPS[zone].ground)).toBe(true)
    }
  })

  test('the wizard stands on the ground, just right of the flag in progress', () => {
    const grid = scene({ columns: 120, zone: 'camp', waypoints: three, companions: 0, frame: 0 })
    const road = roadWidth(120, 'camp')
    const flags = fitWaypoints(three, flagSlots(road))
    expect(wizardAt(grid, avatarX(flags, road), GROUND_ROW - SPRITES.wizard.height)).toBe(true)
  })

  test('no tasks: the wizard at the left margin', () => {
    const grid = scene({ columns: 80, zone: 'wilds', waypoints: [], companions: 0, frame: 0 })
    expect(wizardAt(grid, 2, GROUND_ROW - SPRITES.wizard.height)).toBe(true)
  })

  test('frame 1 lifts the wizard a pixel; only the figures change', () => {
    const still = scene({ columns: 120, zone: 'forge', waypoints: three, companions: 2, frame: 0 })
    const lifted = scene({ columns: 120, zone: 'forge', waypoints: three, companions: 2, frame: 1 })
    const road = roadWidth(120, 'forge')
    const hero = avatarX(fitWaypoints(three, flagSlots(road)), road)
    expect(wizardAt(lifted, hero, GROUND_ROW - SPRITES.wizard.height - 1)).toBe(true)
    still.forEach((line, y) => line.forEach((color, x) => {
      if (lifted[y]?.[x] !== color) expect(x >= hero - 10 * 2 && x < hero + SPRITES.wizard.width).toBe(true)
    }))
  })

  test('the flags are recoloured: the pack\'s red is gone, and the one in progress is yellow', () => {
    const grid = scene({ columns: 120, zone: 'map', waypoints: ['now'], companions: 0, frame: 0 })
    const x0 = waypointX(0, 1, roadWidth(120, 'map'))
    const flagPixels = grid.slice(GROUND_ROW - 8, GROUND_ROW).flatMap(line => line.slice(x0, x0 + FLAG_WIDTH))
    expect(flagPixels.filter(red)).toEqual([])
    expect(flagPixels.some(c => c === 0xf2d15b)).toBe(true)
  })

  test('ghosts are drawn up to MAX_GHOSTS', () => {
    const none = scene({ columns: 160, zone: 'wilds', waypoints: ['now'], companions: 0, frame: 0 })
    const many = scene({ columns: 160, zone: 'wilds', waypoints: ['now'], companions: MAX_GHOSTS + 3, frame: 0 })
    const four = scene({ columns: 160, zone: 'wilds', waypoints: ['now'], companions: MAX_GHOSTS, frame: 0 })
    const changed = (a: typeof none, b: typeof none) => a.flatMap((line, y) => line.filter((c, x) => b[y]?.[x] !== c)).length
    expect(changed(none, many) > 0).toBe(true)
    expect(changed(four, many)).toBe(0)
    expect(half([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toEqual([[1, 3], [7, 9]])
  })

  test('narrow widths still give a full grid, clipped', () => {
    for (const columns of [24, 8, 0]) {
      const grid = scene({ columns, zone: 'harbour', waypoints: three, companions: 3, frame: 1 })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === columns)).toBe(true)
    }
  })
})
