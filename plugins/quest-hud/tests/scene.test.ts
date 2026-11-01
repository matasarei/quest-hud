import { describe, expect, test } from 'claude-code/testing'

import { AVATAR, MAGE, mapToGrid } from '../src/avatar'
import { avatarX, BACKDROPS, GROUND_ROW, MAX_FLAGS, MAX_GHOSTS, scene, SCENE_HEIGHT, waypointsOf, waypointX, type Waypoint } from '../src/scene'
import type { Task, Zone } from '../types'

const ZONES: readonly Zone[] = ['watchtower', 'harbour', 'dungeon', 'arena', 'forge', 'map', 'camp', 'wilds']

const task = (id: string, status: Task['status']): Task => ({ id, subject: id, status })

/** Whether the avatar's map, placed at (x, y), shows in the grid: every filled pixel that falls inside it. */
const avatarAt = (grid: ReturnType<typeof scene>, x: number, y: number): boolean => {
  const avatar = mapToGrid(AVATAR, MAGE)
  return avatar.every((line, dy) =>
    line.every((color, dx) => color === undefined || y + dy < 0 || y + dy >= grid.length || grid[y + dy]?.[x + dx] === color),
  )
}

describe('waypointsOf', () => {
  test('one flag per task, in order, with its state', () => {
    expect(waypointsOf([task('a', 'completed'), task('b', 'in_progress'), task('c', 'pending')])).toEqual(['done', 'now', 'todo'])
  })

  test('no tasks, no flags', () => {
    expect(waypointsOf([])).toEqual([])
  })

  test('more tasks than flags share them, and a shared flag shows the most urgent state', () => {
    const tasks = Array.from({ length: 30 }, (_, i) => task(String(i), i < 10 ? 'completed' : i === 10 ? 'in_progress' : 'pending'))
    const flags = waypointsOf(tasks)
    expect(flags).toHaveLength(MAX_FLAGS)
    expect(flags.filter(f => f === 'now')).toHaveLength(1)
    expect(flags[0]).toBe('done')
    expect(flags[MAX_FLAGS - 1]).toBe('todo')
  })
})

describe('scene', () => {
  const five: Waypoint[] = ['done', 'done', 'now', 'todo', 'todo']

  test('is columns × SCENE_HEIGHT pixels', () => {
    const grid = scene({ columns: 60, zone: 'forge', waypoints: five, companions: 0, frame: 0 })
    expect(grid).toHaveLength(SCENE_HEIGHT)
    expect(grid.every(line => line.length === 60)).toBe(true)
  })

  test('the avatar stands one pixel right of the third flag\'s pole when the third task is in progress', () => {
    const grid = scene({ columns: 60, zone: 'forge', waypoints: five, companions: 0, frame: 0 })
    expect(avatarX(five, 60)).toBe(waypointX(2, 5, 60) + 1)
    expect(avatarAt(grid, waypointX(2, 5, 60) + 1, SCENE_HEIGHT - AVATAR.length)).toBe(true)
  })

  test('with nothing in progress, at the first flag still to do; all done, at the last', () => {
    expect(avatarX(['done', 'todo', 'todo'], 60)).toBe(waypointX(1, 3, 60) + 1)
    expect(avatarX(['done', 'done'], 60)).toBe(waypointX(1, 2, 60) + 1)
  })

  test('no tasks: the avatar at the left margin', () => {
    const grid = scene({ columns: 60, zone: 'wilds', waypoints: [], companions: 0, frame: 0 })
    expect(avatarAt(grid, 2, SCENE_HEIGHT - AVATAR.length)).toBe(true)
  })

  test('frame 1 lifts the figures a pixel and changes nothing else', () => {
    const still = scene({ columns: 60, zone: 'arena', waypoints: five, companions: 2, frame: 0 })
    const lifted = scene({ columns: 60, zone: 'arena', waypoints: five, companions: 2, frame: 1 })
    expect(avatarAt(lifted, avatarX(five, 60), SCENE_HEIGHT - AVATAR.length - 1)).toBe(true)
    // Every pixel that differs lies in the figures' columns: the ghosts behind the avatar and the avatar itself.
    const hero = avatarX(five, 60)
    const left = hero - 7 * 2
    still.forEach((line, y) => line.forEach((color, x) => {
      if (lifted[y]?.[x] !== color) expect(x >= left && x < hero + AVATAR[0]!.length).toBe(true)
    }))
  })

  test('each zone has its own sky', () => {
    const skies = ZONES.map(zone => scene({ columns: 40, zone, waypoints: [], companions: 0, frame: 0 })[0]?.[0])
    expect(new Set(skies).size).toBe(ZONES.length)
    ZONES.forEach(zone => expect(BACKDROPS[zone].sky).toBe(scene({ columns: 40, zone, waypoints: [], companions: 0, frame: 0 })[0]?.[0] ?? -1))
  })

  test('the ground starts at GROUND_ROW', () => {
    const grid = scene({ columns: 40, zone: 'camp', waypoints: [], companions: 0, frame: 0 })
    expect(grid[GROUND_ROW]?.[39]).toBe(BACKDROPS.camp.ground)
    expect(grid[GROUND_ROW - 1]?.[0]).toBe(BACKDROPS.camp.sky)
  })

  test('ghosts are drawn up to MAX_GHOSTS, in a tint of their own', () => {
    const none = scene({ columns: 80, zone: 'forge', waypoints: ['now'], companions: 0, frame: 0 })
    const many = scene({ columns: 80, zone: 'forge', waypoints: ['now'], companions: MAX_GHOSTS + 3, frame: 0 })
    const changed = (a: typeof none, b: typeof none) => a.flatMap((line, y) => line.filter((c, x) => b[y]?.[x] !== c)).length
    const four = scene({ columns: 80, zone: 'forge', waypoints: ['now'], companions: MAX_GHOSTS, frame: 0 })
    expect(changed(none, many) > 0).toBe(true)
    expect(changed(four, many)).toBe(0)
  })

  test('narrow widths still give a full grid, clipped', () => {
    for (const columns of [24, 8, 0]) {
      const grid = scene({ columns, zone: 'map', waypoints: five, companions: 3, frame: 1 })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === columns)).toBe(true)
    }
  })
})
