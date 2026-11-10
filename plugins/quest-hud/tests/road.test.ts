import { describe, expect, test } from 'claude-code/testing'

import { MAX_TASK_ROWS, road, ROAD_ROWS_WANTED, roadScene, sceneFits, SCENE_MIN_COLUMNS, SCENE_ROWS, sceneZone, taskWindow, type RoadArgs } from '../src/road'
import { SCENE_HEIGHT, skyColor } from '../src/scene'
import { clockTime } from '../src/log'
import { cellWidth } from '../src/meters'
import type { LevelCard, LogEntry, Quest, Task } from '../types'

const implement: Quest = { title: 'gku:implement', skill: 'gku:implement', zone: 'forge', startedAt: 0 }
const task = (id: string, status: Task['status']): Task => ({ id, subject: `task ${id}`, status })
const five = [task('1', 'completed'), task('2', 'completed'), task('3', 'in_progress'), task('4', 'pending'), task('5', 'pending')]
const entries = (count: number): LogEntry[] =>
  Array.from({ length: count }, (_, i) => ({ at: new Date(2026, 10, 1, 9, i).getTime(), kind: 'cast', text: `f${i}.ts +1 -0` }))

const NOW = Date.parse('2026-11-01T10:00:00Z')

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
  now: NOW,
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

  const hpCases = [
    [60, 'hp'],
    [61, 'hpLow'],
    [80, 'hpLow'],
    [81, 'hpCritical'],
  ] as const

  for (const [weekUsed, tone] of hpCases) {
    test(`at ${weekUsed}% used the HP bar is ${tone}, and MP stays mp`, () => {
      const { meters } = road(args({ meters: { window: 200_000, contextPercent: 43, weekUsed } }))
      expect(meters.map(s => s.tone)).toEqual([tone, 'mp'])
    })
  }

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

describe('the bars row in the pane it has', () => {
  const RESETS = '2026-11-01T12:00:00Z'
  const T = clockTime(Date.parse(RESETS))
  const SUB = { window: 200_000, contextPercent: 41, weekUsed: 38, fiveHourUsed: 70, fiveHourResetsAt: RESETS, costUsd: 1.84 }
  const text = (columns: number, meters: RoadArgs['meters'] = SUB, bars: RoadArgs['bars'] = 'all') =>
    road(args({ columns, meters, bars })).meters.map(segment => segment.text).join('')

  const forms = [
    [60, `♥ ██████░░░░ 62%   ✦ ██████░░░░ 59%   ⏾30% · ${T}   ◉ $1.84`],
    [52, '♥ ██████░░░░ 62%   ✦ ██████░░░░ 59%   ⏾30%   ◉ $1.84'],
    [44, '♥ █████░░░ 62%  ✦ █████░░░ 59%  ⏾30%  ◉$1.84'],
    [36, '♥ ██░░ 62%  ✦ ██░░ 59%  ⏾30%  ◉$1.84'],
    [26, '♥ 62%  ✦ 59%  ⏾30%  ◉$1.84'],
  ] as const

  forms.forEach(([columns, expected], i) => {
    test(`${columns} columns: ${expected}`, () => {
      expect(text(columns)).toBe(expected)
      expect(cellWidth(road(args({ columns, meters: SUB, bars: 'all' })).meters)).toBe(columns)
    })

    const narrower = forms[i + 1]
    if (narrower) {
      test(`${columns - 1} columns: the next form down`, () => {
        expect(text(columns - 1)).toBe(narrower[1])
      })
    }
  })

  test('narrower than the figures, still the figures, never cut', () => {
    expect(text(10)).toBe('♥ 62%  ✦ 59%  ⏾30%  ◉$1.84')
    expect(text(0)).toBe('♥ 62%  ✦ 59%  ⏾30%  ◉$1.84')
  })

  // The widest figures there are: nothing may overflow, so nothing is cut.
  const WIDEST = { window: 1_000_000, contextPercent: 0, weekUsed: 0, fiveHourUsed: 1, fiveHourResetsAt: RESETS, costUsd: 123.45 }
  const noWeek = { window: 1_000_000, contextPercent: 0, fiveHourUsed: 61, fiveHourResetsAt: RESETS, costUsd: 123.45 }

  for (const [name, meters, hasHp] of [['with HP', WIDEST, true], ['without HP', noWeek, false]] as const) {
    for (const bars of ['hpmp', 'all'] as const) {
      test(`${name}, bars = ${bars}: from 12 to 90 columns the row fits or is the figures, its percentages whole`, () => {
        const figures = cellWidth(road(args({ columns: 0, meters, bars })).meters)

        for (let columns = 12; columns <= 90; columns++) {
          const drawn = road(args({ columns, meters, bars })).meters

          expect(cellWidth(drawn) <= columns || cellWidth(drawn) === figures).toBe(true)
          expect(text(columns, meters, bars).split('100%').length - 1).toBe(hasHp ? 2 : 1)
          expect(text(columns, meters, bars).startsWith(hasHp ? '♥' : '✦')).toBe(true)
          expect(text(columns, meters, bars).includes('⏾')).toBe(true)
          if (bars === 'all') expect(/⏾.*◉/.test(text(columns, meters, bars))).toBe(true)
        }
      })
    }
  }
})

describe('the level on the meters row', () => {
  const CARD: LevelCard = {
    level: 8,
    title: 'Sage',
    points: 16,
    outOf: 21,
    parts: [],
    usage: { isRead: true, sessions: 1, days: 1, editingSessions: 0, checkedSessions: 0, testRuns: 0, lintRuns: 0, skillSessions: 0, allSessions: 1, skillRuns: {}, agentCalls: 0, agentSessions: 0, mcpCalls: 0, mcpServers: 0, browserCalls: 0, webCalls: 0, ghRuns: 0, edits: {} },
  }
  const width = road(args()).meters.reduce((sum, segment) => sum + segment.text.length, 0)
  const shown = (columns: number, level: LevelCard | null = CARD) => road(args({ columns, level })).level

  test('no level yet: nothing', () => {
    expect(shown(60, null)).toBeUndefined()
    expect(road(args()).level).toBeUndefined()
  })

  test('the level and its title, with room', () => {
    expect(shown(60)).toBe('Lv 8 Sage')
  })

  test('the title goes first as the pane narrows, then the level', () => {
    expect(shown(width + 2 + 'Lv 8 Sage'.length)).toBe('Lv 8 Sage')
    expect(shown(width + 2 + 'Lv 8 Sage'.length - 1)).toBe('Lv 8')
    expect(shown(width + 2 + 'Lv 8'.length)).toBe('Lv 8')
    expect(shown(width + 2 + 'Lv 8'.length - 1)).toBeUndefined()
  })

  test('⏾ is two cells: a 5-hour window on the row leaves the level its true room', () => {
    const resetsAt = '2026-11-01T12:00:00Z'
    const meters = { window: 200_000, contextPercent: 43, weekUsed: 20, fiveHourUsed: 70, fiveHourResetsAt: resetsAt }
    const row = road(args({ meters })).meters
    expect(row[row.length - 1]).toEqual({ text: `   ⏾30% · ${clockTime(Date.parse(resetsAt))}`, tone: 'hpLow' })
    const used = cellWidth(row)
    expect(road(args({ meters, columns: used + 2 + 'Lv 8'.length, level: CARD })).level).toBe('Lv 8')
    expect(road(args({ meters, columns: used + 2 + 'Lv 8'.length - 1, level: CARD })).level).toBeUndefined()
  })

  test('a row too wide for the pane draws the 5-hour window without its reset time', () => {
    const meters = { window: 200_000, contextPercent: 43, weekUsed: 20, fiveHourUsed: 70, fiveHourResetsAt: '2026-11-01T12:00:00Z' }
    const timed = cellWidth(road(args({ meters })).meters)
    expect(road(args({ meters, columns: timed })).meters.at(-1)?.text).toContain(' · ')
    expect(road(args({ meters, columns: timed - 1 })).meters.at(-1)?.text).toBe('   ⏾30%')
  })

  test('the wider bars of `all` leave it less room', () => {
    const wide = road(args({ columns: width + 2 + 'Lv 8 Sage'.length, level: CARD, bars: 'all', meters: { window: 200_000, contextPercent: 43, weekUsed: 20, fiveHourUsed: 10, costUsd: 1.5 } }))
    expect(wide.level).not.toBe('Lv 8 Sage')
  })
})

describe('sceneFits', () => {
  const NEEDS = 1 + SCENE_ROWS + 1
  const fits = (rows: number, tasks = 0, companions = 0, columns = 60) => sceneFits({ columns, rows, tasks, companions })

  test('needs room for the header, the scene and the bars', () => {
    expect(fits(NEEDS)).toBe(true)
    expect(fits(NEEDS - 1)).toBe(false)
  })

  test('leaves a row for the task in progress when there are tasks', () => {
    expect(fits(NEEDS, 3)).toBe(false)
    expect(fits(NEEDS + 1, 3)).toBe(true)
  })

  test('leaves a row for the companions when there are any', () => {
    expect(fits(NEEDS, 0, 2)).toBe(false)
    expect(fits(NEEDS + 1, 0, 2)).toBe(true)
    expect(fits(NEEDS + 1, 3, 2)).toBe(false)
    expect(fits(NEEDS + 2, 3, 2)).toBe(true)
  })

  test('still needs its columns, however many rows', () => {
    expect(fits(100, 0, 0, SCENE_MIN_COLUMNS - 1)).toBe(false)
    expect(fits(100, 0, 0, SCENE_MIN_COLUMNS)).toBe(true)
  })
})

describe('the Road in a short pane', () => {
  test('too short for the scene: no art, and the text keeps the room', () => {
    const view = road(args({ rows: 11 }))
    expect(view.art).toEqual([])
    expect(view.scene).toEqual([])
    expect(view.tasks).toHaveLength(5)
    expect(view.log).toHaveLength(3)
    expect(view.meters.length).toBeGreaterThan(0)
  })

  test('with just room for the scene and one task: the task in progress, and no log', () => {
    const view = road(args({ rows: 1 + SCENE_ROWS + 1 + 1 }))
    expect(view.art.length).toBeGreaterThan(0)
    expect(view.tasks).toEqual(['▸ task 3'])
    expect(view.log).toEqual([])
  })

  test('with room for the whole Road: all of it, in exactly what it asks for', () => {
    const tasks = Array.from({ length: 20 }, (_, i) => task(String(i), 'pending'))
    const view = road(args({ rows: ROAD_ROWS_WANTED, tasks, log: entries(20), companions: [{ id: 'a', type: 'Explore' }] }))
    expect(view.art.length).toBeGreaterThan(0)
    expect(view.tasks).toHaveLength(MAX_TASK_ROWS)
    expect(view.log).toHaveLength(5)
    // The header, the scene, the companions, the tasks, the bars, the log's heading and its rows.
    expect(1 + SCENE_ROWS + 1 + view.tasks.length + 1 + 1 + view.log.length).toBe(ROAD_ROWS_WANTED)
  })
})
