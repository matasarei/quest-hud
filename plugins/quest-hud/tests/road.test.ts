import { describe, expect, test } from 'claude-code/testing'

import { road, roadScene, SCENE_MIN_COLUMNS, SCENE_ROWS, sceneZone, taskWindow, type RoadArgs } from '../src/road'
import { SCENE_HEIGHT, skyColor } from '../src/scene'
import type { LogEntry, Quest, Task } from '../types'

const implement: Quest = { title: 'gku:implement', skill: 'gku:implement', zone: 'forge', startedAt: 0 }
const task = (id: string, status: Task['status']): Task => ({ id, subject: `task ${id}`, status })
const five = [task('1', 'completed'), task('2', 'completed'), task('3', 'in_progress'), task('4', 'pending'), task('5', 'pending')]
const entries = (count: number): LogEntry[] =>
  Array.from({ length: count }, (_, i) => ({ at: new Date(2026, 10, 1, 9, i).getTime(), kind: 'cast', text: `f${i}.ts +1 -0` }))

const args = (over: Partial<RoadArgs> = {}): RoadArgs => ({
  quest: implement,
  tasks: five,
  meters: { window: 200_000, contextPercent: 43, weekUsed: 20 },
  log: entries(3),
  companions: [],
  activity: null,
  foes: { test: 'none', lint: 'none' },
  loot: 0,
  allies: { octopus: false, fox: false },
  bars: 'hpmp',
  columns: 60,
  rows: 30,
  ...over,
})

describe('road', () => {
  test('the header names the skill and what its zone means; the count is done/total', () => {
    const view = road(args())
    expect(view.header).toBe('⚔ gku:implement · Forge — building and fixing')
    expect(view.count).toBe('task 2/5')
  })

  test('with no skill running: the Wilds, and no count without tasks', () => {
    const view = road(args({ quest: null, tasks: [] }))
    expect(view.header).toBe('Wilds — no skill running')
    expect(view.count).toBeUndefined()
  })

  test('the scene is columns × SCENE_HEIGHT', () => {
    const view = road(args())
    expect(view.scene).toHaveLength(SCENE_HEIGHT)
    expect(view.scene.every(line => line.length === 60)).toBe(true)
  })

  test('the tasks, marked done, in progress or to do', () => {
    expect(road(args()).tasks).toEqual(['✓ task 1', '✓ task 2', '▸ task 3', '· task 4', '· task 5'])
  })

  test('the bars, HP then MP', () => {
    expect(road(args()).meters.map(s => s.text).join('')).toBe('♥ ████████░░ 80%   ✦ ██████░░░░ 57%')
  })

  test('the log\'s newest lines, with the time and the kind', () => {
    expect(road(args()).log).toEqual(['09:00 cast  f0.ts +1 -0', '09:01 cast  f1.ts +1 -0', '09:02 cast  f2.ts +1 -0'])
  })

  test('short of rows, the log goes first, then tasks; the one in progress stays', () => {
    const rows = 1 + SCENE_ROWS + 1 + 3
    const view = road(args({ rows, log: entries(10) }))
    expect(view.log).toEqual([])
    expect(view.tasks).toHaveLength(3)
    expect(view.tasks).toContain('▸ task 3')
  })

  test('the log fills what rows are left, newest last', () => {
    const view = road(args({ rows: 1 + SCENE_ROWS + 5 + 1 + 4, log: entries(10) }))
    expect(view.log).toEqual(['09:07 cast  f7.ts +1 -0', '09:08 cast  f8.ts +1 -0', '09:09 cast  f9.ts +1 -0'])
  })

  test('companions: a line naming up to four, then +n', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, type: i === 0 ? 'Explore' : 'Plan' }))
    expect(road(args({ companions: many.slice(0, 1) })).companions).toBe('with Explore')
    expect(road(args({ companions: many })).companions).toBe('with Explore, Plan, Plan, Plan (+2)')
    expect(road(args()).companions).toBeUndefined()
  })
})

describe('taskWindow', () => {
  test('a window around the task in progress, in order', () => {
    const many = Array.from({ length: 20 }, (_, i) => task(String(i), i < 12 ? 'completed' : i === 12 ? 'in_progress' : 'pending'))
    const window = taskWindow(many, 8)
    expect(window).toHaveLength(8)
    expect(window).toContain('▸ task 12')
    expect(window[0]).toBe('✓ task 8')
  })

  test('with nothing in progress, around the first open task; no room, nothing', () => {
    expect(taskWindow([task('1', 'completed'), task('2', 'pending')], 1)).toEqual(['· task 2'])
    expect(taskWindow(five, 0)).toEqual([])
  })
})

describe('the scene\'s zone', () => {
  test('the skill\'s zone; in the Wilds, the last kind of work; else the Wilds', () => {
    expect(sceneZone(implement, 'map')).toBe('forge')
    expect(sceneZone(null, 'map')).toBe('map')
    expect(sceneZone(null, null)).toBe('wilds')
    expect(roadScene({ quest: null, tasks: [], companions: [], activity: 'map', foes: { test: 'none', lint: 'none' }, loot: 0, allies: { octopus: false, fox: false }, columns: 10 })[0]?.[0]).toBe(skyColor('map'))
  })
})

describe('the loot count', () => {
  test('beside the task count, or alone', () => {
    expect(road(args({ loot: 3 })).count).toBe('task 2/5 · loot 3')
    expect(road(args({ tasks: [], loot: 1 })).count).toBe('loot 1')
    expect(road(args({ tasks: [], loot: 0 })).count).toBe(undefined)
  })
})

describe('a pane too narrow for the scene', () => {
  test('below SCENE_MIN_COLUMNS there is no scene, and the log gets its rows', () => {
    const narrow = road(args({ columns: SCENE_MIN_COLUMNS - 1, log: entries(40) }))
    const wide = road(args({ columns: SCENE_MIN_COLUMNS, log: entries(40) }))
    expect(narrow.scene).toEqual([])
    expect(wide.scene).toHaveLength(SCENE_HEIGHT)
    expect(wide.scene[0]).toHaveLength(SCENE_MIN_COLUMNS)
    expect(narrow.log.length).toBe(wide.log.length + SCENE_ROWS)
  })
})
