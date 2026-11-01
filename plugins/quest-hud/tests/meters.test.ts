import { describe, expect, test } from 'claude-code/testing'

import { bandModel, bar, fromMeasure, healsIn, hpLeft, mpLeft, shortTokens, statusText } from '../src/meters'
import type { Meters, Quest, Task } from '../types'

const NOW = Date.parse('2026-11-01T10:00:00Z')

const SUBSCRIBER = {
  context: { tokens: 82_000, window: 200_000, percent: 41 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23.5, resetsAt: '2026-11-01T12:00:00Z' },
    { kind: 'seven_day', percentUsed: 38, resetsAt: '2026-11-03T14:00:00Z' },
  ],
  cost: { usd: 1.844 },
}

const quest: Quest = { title: 'gku:implement', skill: 'gku:implement', zone: 'forge', startedAt: 0 }
const tasks: Task[] = [
  { id: '1', subject: 'Read the exporter', status: 'completed' },
  { id: '2', subject: 'Write the CSV writer tests', status: 'in_progress' },
  { id: '3', subject: 'Wire it in', status: 'pending' },
]

const text = (segments: { text: string }[]) => segments.map(s => s.text).join('')

describe('fromMeasure', () => {
  test('reads the context, both windows and the cost', () => {
    expect(fromMeasure(SUBSCRIBER)).toEqual({
      contextPercent: 41, contextTokens: 82_000, window: 200_000,
      weekUsed: 38, weekResetsAt: '2026-11-03T14:00:00Z', fiveHourUsed: 23.5, costUsd: 1.844,
    })
  })

  test('an account with no windows and a fresh context keeps only the window', () => {
    expect(fromMeasure({ context: { window: 200_000 }, rateLimits: [] })).toEqual({ window: 200_000 })
  })
})

describe('left', () => {
  test('HP and MP are what is left, rounded', () => {
    const meters = fromMeasure(SUBSCRIBER)
    expect(hpLeft(meters)).toBe(62)
    expect(mpLeft(meters)).toBe(59)
  })

  test('a spent window past 100 is 0 left, never negative', () => {
    expect(hpLeft({ window: 1, weekUsed: 104.5 })).toBe(0)
  })

  test('nothing measured is undefined, not 100', () => {
    expect(hpLeft(null)).toBeUndefined()
    expect(mpLeft({ window: 200_000 })).toBeUndefined()
  })
})

describe('bar', () => {
  test('fills the share of cells that is left', () => {
    expect(bar(50, 10)).toBe('█████░░░░░')
    expect(bar(0, 4)).toBe('░░░░')
    expect(bar(100, 4)).toBe('████')
    expect(bar(62, 10, '▰', '▱')).toBe('▰▰▰▰▰▰▱▱▱▱')
  })

  test('out-of-range values are clamped', () => {
    expect(bar(-5, 3)).toBe('░░░')
    expect(bar(250, 3)).toBe('███')
  })
})

describe('healsIn', () => {
  test('days and hours, hours and minutes, minutes', () => {
    expect(healsIn('2026-11-03T14:00:00Z', NOW)).toBe('2d 4h')
    expect(healsIn('2026-11-01T13:12:00Z', NOW)).toBe('3h 12m')
    expect(healsIn('2026-11-01T10:45:30Z', NOW)).toBe('45m')
  })

  test('a reset now or past is <1m', () => {
    expect(healsIn('2026-11-01T10:00:20Z', NOW)).toBe('<1m')
    expect(healsIn('2026-10-01T00:00:00Z', NOW)).toBe('<1m')
  })

  test('no time, or one that cannot be read, is undefined', () => {
    expect(healsIn(undefined, NOW)).toBeUndefined()
    expect(healsIn('soon', NOW)).toBeUndefined()
  })
})

describe('shortTokens', () => {
  test('k and M', () => {
    expect(shortTokens(950)).toBe('950')
    expect(shortTokens(82_400)).toBe('82k')
    expect(shortTokens(200_000)).toBe('200k')
    expect(shortTokens(1_000_000)).toBe('1M')
    expect(shortTokens(1_250_000)).toBe('1.3M')
  })
})

describe('bandModel', () => {
  test('the full band: skill, zone, tasks, both bars', () => {
    const band = bandModel(quest, tasks, fromMeasure(SUBSCRIBER), 'hpmp', NOW)
    expect(text(band.head)).toBe('⚔ gku:implement  Forge  task 1/3 · Write the CSV writer tests')
    expect(text(band.meters)).toBe('♥ HP █████████░░░░░ 62% week · heals in 2d 4h   ✦ MP ████████░░░░░░ 59% ctx · 82k/200k')
  })

  test('no rate-limit windows: no HP, and no error', () => {
    const band = bandModel(quest, [], fromMeasure({ context: { tokens: 10_000, window: 200_000, percent: 5 }, rateLimits: [] }), 'hpmp', NOW)
    expect(text(band.meters).includes('HP')).toBe(false)
    expect(text(band.meters).startsWith('✦ MP ')).toBe(true)
  })

  test('the context not measured yet shows MP as —', () => {
    expect(text(bandModel(null, [], null, 'hpmp', NOW).meters)).toBe('✦ MP — ctx')
  })

  test('no quest and no tasks: an empty head', () => {
    expect(bandModel(null, [], null, 'hpmp', NOW).head).toEqual([])
  })

  test('tasks with none in progress: the count and no subject', () => {
    const band = bandModel(quest, [{ id: '1', subject: 'a', status: 'pending' }], null, 'hpmp', NOW)
    expect(text(band.head)).toBe('⚔ gku:implement  Forge  task 0/1')
  })

  test('bars = all adds the 5-hour window and the cost', () => {
    const band = bandModel(quest, [], fromMeasure(SUBSCRIBER), 'all', NOW)
    expect(text(band.meters).endsWith('   ⚡5h 24%   ◉ $1.84')).toBe(true)
  })

  test('each segment carries its tone', () => {
    const band = bandModel(quest, tasks, fromMeasure(SUBSCRIBER), 'hpmp', NOW)
    expect(band.head[0]).toEqual({ text: '⚔ gku:implement', tone: 'accent' })
    expect(band.meters.find(s => s.text.startsWith('♥'))?.tone).toBe('hp')
    expect(band.meters.find(s => s.text.startsWith('✦'))?.tone).toBe('mp')
  })
})

describe('statusText', () => {
  test('one line with the quest, the count and both bars', () => {
    expect(statusText(quest, tasks, fromMeasure(SUBSCRIBER), 'hpmp')).toBe('⚔ gku:implement 1/3 ♥▰▰▰▰▰▰▱▱▱▱ 62% ✦▰▰▰▰▰▰▱▱▱▱ 59%')
  })

  test('nothing yet: only the MP placeholder', () => {
    expect(statusText(null, [], null, 'hpmp')).toBe('✦ —')
  })

  test('bars = all adds the 5-hour window and the cost', () => {
    const meters: Meters = { window: 1, contextPercent: 0, fiveHourUsed: 9.6, costUsd: 0.5 }
    expect(statusText(null, [], meters, 'all')).toBe('✦▰▰▰▰▰▰▰▰▰▰ 100% ⚡10% ◉$0.50')
  })
})
