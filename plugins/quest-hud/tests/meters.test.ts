import { describe, expect, test } from 'claude-code/testing'

import { clockTime } from '../src/log'
import { bandModel, bar, cellWidth, fiveLeft, fiveSegment, fromMeasure, healsIn, hintText, hpLeft, hpTone, mpLeft, shortTokens, showsFive, statusText, TONE_COLOR, ZONE_MEANING, zoneLine } from '../src/meters'
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
/** SUBSCRIBER's 5-hour reset, in the machine's own time as the band draws it. */
const RESET = clockTime(Date.parse('2026-11-01T12:00:00Z'))

describe('fromMeasure', () => {
  test('reads the context, both windows and the cost', () => {
    expect(fromMeasure(SUBSCRIBER)).toEqual({
      contextPercent: 41, contextTokens: 82_000, window: 200_000,
      weekUsed: 38, weekResetsAt: '2026-11-03T14:00:00Z', fiveHourUsed: 23.5, fiveHourResetsAt: '2026-11-01T12:00:00Z', costUsd: 1.844,
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

  test('no weekly window measured is undefined, not 100', () => {
    expect(hpLeft(null)).toBeUndefined()
  })

  test('a context window not measured yet is full: nothing is spent before the first response', () => {
    expect(mpLeft({ window: 200_000 })).toBe(100)
    expect(mpLeft(null)).toBe(100)
  })
})

describe('hpTone', () => {
  const cases = [
    [100, 'hp'],
    [40, 'hp'],
    [39, 'hpLow'],
    [20, 'hpLow'],
    [19, 'hpCritical'],
    [0, 'hpCritical'],
  ] as const

  for (const [left, tone] of cases) {
    test(`${left}% left is ${tone}`, () => {
      expect(hpTone(left)).toBe(tone)
    })
  }

  test('it reads the rounded figure on screen, so the colour agrees with the number', () => {
    const toneAt = (weekUsed: number) => hpTone(hpLeft({ window: 1, weekUsed }) as number)
    expect(toneAt(60.4)).toBe('hp')
    expect(toneAt(60.6)).toBe('hpLow')
    expect(toneAt(80.4)).toBe('hpLow')
    expect(toneAt(80.6)).toBe('hpCritical')
  })

  test('each warning has a colour of its own', () => {
    const colors = [TONE_COLOR.hp, TONE_COLOR.hpLow, TONE_COLOR.hpCritical]
    expect(colors.every(color => color !== undefined)).toBe(true)
    expect(new Set(colors).size).toBe(3)
  })
})

describe('the 5-hour window', () => {
  const LATER = NOW + 150 * 60_000
  const RESETS = new Date(LATER).toISOString()
  const five = (fiveHourUsed: number, weekUsed?: number, fiveHourResetsAt: string | null = RESETS): Meters => ({
    window: 200_000,
    fiveHourUsed,
    ...(fiveHourResetsAt === null ? {} : { fiveHourResetsAt }),
    ...(weekUsed === undefined ? {} : { weekUsed }),
  })

  test('what is left, rounded as HP is, and clamped', () => {
    expect(fiveLeft(five(23.5), NOW)).toBe(77)
    expect(fiveLeft(five(104), NOW)).toBe(0)
  })

  test('no window is undefined, not full', () => {
    expect(fiveLeft(null, NOW)).toBeUndefined()
    expect(fiveLeft({ window: 1, weekUsed: 10 }, NOW)).toBeUndefined()
  })

  test('a reset already passed is a full window, whatever the last measure said', () => {
    expect(fiveLeft(five(92), LATER)).toBe(100)
    expect(fiveLeft(five(92), LATER + 1)).toBe(100)
    expect(fiveLeft(five(92), LATER - 1)).toBe(8)
  })

  test('a reset that cannot be read, or none, leaves the figure as measured', () => {
    expect(fiveLeft(five(92, undefined, 'soon'), NOW)).toBe(8)
    expect(fiveLeft(five(92, undefined, null), NOW)).toBe(8)
  })

  const shows = [
    ['all, plenty left', five(10, 38), 'all', true],
    ['hpmp, more left than HP', five(23.5, 38), 'hpmp', false],
    ['hpmp, as much left as HP', five(38, 38), 'hpmp', false],
    ['hpmp, less left than HP', five(39, 38), 'hpmp', true],
    ['hpmp, HP full, 5-hour full', five(0, 0), 'hpmp', false],
    ['hpmp, HP full, 99 left: tighter than HP', five(1, 0), 'hpmp', true],
    ['hpmp, HP 20, 39 left: under 40', five(61, 80), 'hpmp', true],
    ['hpmp, no HP, 40 left', five(60), 'hpmp', false],
    ['hpmp, no HP, 39 left', five(61), 'hpmp', true],
    ['all, no window', { window: 1, weekUsed: 38 }, 'all', false],
  ] as const

  for (const [name, meters, bars, expected] of shows) {
    test(`${name}: ${expected ? 'drawn' : 'not drawn'}`, () => {
      expect(showsFive(meters, bars, NOW)).toBe(expected)
    })
  }

  test('hpmp lets it go once its reset has passed', () => {
    expect(showsFive(five(92, 38), 'hpmp', NOW)).toBe(true)
    expect(showsFive(five(92, 38), 'hpmp', LATER)).toBe(false)
  })

  test('the figure and the clock time it resets', () => {
    expect(fiveSegment(five(70), 'hpmp', NOW)).toEqual({ text: `⏾30% · ${clockTime(LATER)}`, tone: 'hpLow' })
  })

  test('without the time where there is no room, or no reset to come', () => {
    expect(fiveSegment(five(70), 'hpmp', NOW, false)?.text).toBe('⏾30%')
    expect(fiveSegment(five(70, undefined, null), 'hpmp', NOW)?.text).toBe('⏾30%')
    expect(fiveSegment(five(70, undefined, 'soon'), 'hpmp', NOW)?.text).toBe('⏾30%')
    expect(fiveSegment(five(92), 'all', LATER)).toEqual({ text: '⏾100%', tone: 'hp' })
  })

  test('not drawn is undefined', () => {
    expect(fiveSegment(five(10, 38), 'hpmp', NOW)).toBeUndefined()
    expect(fiveSegment(null, 'all', NOW)).toBeUndefined()
  })

  const tones = [
    [60, 'hp'],
    [61, 'hpLow'],
    [80, 'hpLow'],
    [81, 'hpCritical'],
  ] as const

  for (const [used, tone] of tones) {
    test(`${100 - used}% left is ${tone}, as HP would be`, () => {
      expect(fiveSegment(five(used), 'all', NOW)?.tone).toBe(tone)
    })
  }
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

  test('the context not measured yet shows MP full, with no token count', () => {
    expect(text(bandModel(null, [], null, 'hpmp', NOW).meters)).toBe('✦ MP ██████████████ 100% ctx')
  })

  test('no skill running: the Wilds, and the task list if Claude keeps one', () => {
    expect(bandModel(null, [], null, 'hpmp', NOW).head).toEqual([{ text: 'Wilds', tone: 'dim' }])
    expect(text(bandModel(null, tasks, null, 'hpmp', NOW).head)).toBe('Wilds  task 1/3 · Write the CSV writer tests')
  })

  test('the status line with no skill shows the task count alone', () => {
    expect(statusText(null, tasks, null, 'hpmp', NOW)).toBe('task 1/3 ✦▰▰▰▰▰▰▰▰▰▰ 100%')
  })

  test('tasks with none in progress: the count and no subject', () => {
    const band = bandModel(quest, [{ id: '1', subject: 'a', status: 'pending' }], null, 'hpmp', NOW)
    expect(text(band.head)).toBe('⚔ gku:implement  Forge  task 0/1')
  })

  test('bars = all adds the 5-hour window left, the time it resets, and the cost', () => {
    const band = bandModel(quest, [], fromMeasure(SUBSCRIBER), 'all', NOW)
    expect(text(band.meters).endsWith(`   ⏾77% · ${RESET}   ◉ $1.84`)).toBe(true)
  })

  test('hpmp leaves the 5-hour window out while HP is the tighter one', () => {
    expect(text(bandModel(quest, [], fromMeasure(SUBSCRIBER), 'hpmp', NOW).meters).includes('⏾')).toBe(false)
  })

  test('hpmp adds it once it binds, in HP\'s tones, and never the cost', () => {
    const tight = { ...fromMeasure(SUBSCRIBER), fiveHourUsed: 70 }
    const meters = bandModel(quest, [], tight, 'hpmp', NOW).meters
    expect(text(meters).endsWith(`ctx · 82k/200k   ⏾30% · ${RESET}`)).toBe(true)
    expect(meters[meters.length - 1]?.tone).toBe('hpLow')
  })

  test('each segment carries its tone', () => {
    const band = bandModel(quest, tasks, fromMeasure(SUBSCRIBER), 'hpmp', NOW)
    expect(band.head[0]).toEqual({ text: '⚔ gku:implement', tone: 'accent' })
    expect(band.meters.find(s => s.text.startsWith('♥'))?.tone).toBe('hp')
    expect(band.meters.find(s => s.text.startsWith('✦'))?.tone).toBe('mp')
  })

  const hpCases = [
    [38, 'hp'],
    [61, 'hpLow'],
    [81, 'hpCritical'],
  ] as const

  for (const [weekUsed, tone] of hpCases) {
    test(`at ${weekUsed}% used the HP label, bar and figure are ${tone}, its words dim, and MP stays mp`, () => {
      const { meters } = bandModel(quest, [], { window: 200_000, weekUsed }, 'hpmp', NOW)
      expect(meters.slice(0, 3).map(s => s.tone)).toEqual([tone, tone, tone])
      expect(meters[3]?.tone).toBe('dim')
      expect(meters.slice(4, 7).map(s => s.tone)).toEqual(['mp', 'mp', 'mp'])
    })
  }
})

describe('hintText', () => {
  const quest = { title: 'gku:implement', zone: 'forge' as const, startedAt: 0 }

  test('the bars come first, then the quest with its progress', () => {
    const tasks = [{ id: 'a', subject: 'x', status: 'completed' as const }, { id: 'b', subject: 'y', status: 'pending' as const }]
    expect(hintText(quest, tasks, fromMeasure(SUBSCRIBER), 'hpmp', NOW)).toMatch(/^♥[▰▱]{10} \d+% ✦[▰▱]{10} \d+% ⚔ gku:implement 1\/2$/)
  })

  test('before any figures: a full MP, and no quest or tasks', () => {
    expect(hintText(null, [], null, 'hpmp', NOW)).toBe('✦▰▰▰▰▰▰▰▰▰▰ 100%')
  })

  test('tasks with no quest are counted after the bars', () => {
    expect(hintText(null, [{ id: 'a', subject: 'x', status: 'pending' }], null, 'hpmp', NOW)).toBe('✦▰▰▰▰▰▰▰▰▰▰ 100% task 0/1')
  })

  test('all adds the 5-hour window left and the cost at the end; hpmp, while it does not bind, neither', () => {
    const meters = { window: 200_000, contextPercent: 0, fiveHourUsed: 12, costUsd: 1.5 }
    expect(hintText(null, [], meters, 'all', NOW)).toBe('✦▰▰▰▰▰▰▰▰▰▰ 100% ⏾88% ◉$1.50')
    expect(hintText(null, [], meters, 'hpmp', NOW)).toBe('✦▰▰▰▰▰▰▰▰▰▰ 100%')
  })

  test('hpmp adds the 5-hour window once it binds, with the time it resets', () => {
    const meters = { window: 200_000, contextPercent: 0, fiveHourUsed: 70, fiveHourResetsAt: '2026-11-01T12:00:00Z', costUsd: 1.5 }
    expect(hintText(null, [], meters, 'hpmp', NOW)).toBe(`✦▰▰▰▰▰▰▰▰▰▰ 100% ⏾30% · ${RESET}`)
  })
})

describe('statusText', () => {
  test('one line with the quest, the count and both bars', () => {
    expect(statusText(quest, tasks, fromMeasure(SUBSCRIBER), 'hpmp', NOW)).toBe('⚔ gku:implement 1/3 ♥▰▰▰▰▰▰▱▱▱▱ 62% ✦▰▰▰▰▰▰▱▱▱▱ 59%')
  })

  test('nothing yet: only a full MP', () => {
    expect(statusText(null, [], null, 'hpmp', NOW)).toBe('✦▰▰▰▰▰▰▰▰▰▰ 100%')
  })

  test('bars = all adds the 5-hour window and the cost', () => {
    const meters: Meters = { window: 1, contextPercent: 0, fiveHourUsed: 9.6, costUsd: 0.5 }
    expect(statusText(null, [], meters, 'all', NOW)).toBe('✦▰▰▰▰▰▰▰▰▰▰ 100% ⏾90% ◉$0.50')
  })
})

describe('zone meanings', () => {
  test('every zone says what it stands for', () => {
    for (const zone of ['watchtower', 'harbour', 'dungeon', 'arena', 'forge', 'map', 'camp', 'wilds'] as const) {
      expect(ZONE_MEANING[zone].length > 0).toBe(true)
    }
    expect(zoneLine('map')).toBe('Map room — planning and research')
    expect(zoneLine('wilds')).toBe('Wilds — no skill running')
  })
})

describe('the bars row in the room it has', () => {
  const measured = fromMeasure(SUBSCRIBER)
  const row = (room: number, bars: 'hpmp' | 'all' = 'hpmp', meters: Meters | null = measured) => bandModel(quest, tasks, meters, bars, NOW, room).meters

  const forms = [
    [86, '♥ HP █████████░░░░░ 62% week · heals in 2d 4h   ✦ MP ████████░░░░░░ 59% ctx · 82k/200k'],
    [70, '♥ HP █████████░░░░░ 62% heals 2d 4h   ✦ MP ████████░░░░░░ 59% 82k/200k'],
    [62, '♥ HP ██████░░░░ 62% heals 2d 4h   ✦ MP ██████░░░░ 59% 82k/200k'],
    [53, '♥ HP ██████░░░░ 62% heals 2d 4h   ✦ MP ██████░░░░ 59%'],
    [41, '♥ HP ██████░░░░ 62%   ✦ MP ██████░░░░ 59%'],
    [30, '♥ █████░░░ 62%  ✦ █████░░░ 59%'],
    [22, '♥ ██░░ 62%  ✦ ██░░ 59%'],
    [12, '♥ 62%  ✦ 59%'],
  ] as const

  forms.forEach(([room, expected], i) => {
    test(`${room} cells: ${expected}`, () => {
      expect(text(row(room))).toBe(expected)
      expect(cellWidth(row(room))).toBe(room)
    })

    const narrower = forms[i + 1]
    if (narrower) {
      test(`${room - 1} cells: the next form down`, () => {
        expect(text(row(room - 1))).toBe(narrower[1])
      })
    }
  })

  test('with no room given, the full row', () => {
    expect(text(bandModel(quest, tasks, measured, 'hpmp', NOW).meters)).toBe(forms[0][1])
    expect(text(bandModel(quest, tasks, measured, 'hpmp', NOW, Number.POSITIVE_INFINITY).meters)).toBe(forms[0][1])
  })

  test('with less room than the figures need, still the figures', () => {
    expect(text(row(5))).toBe('♥ 62%  ✦ 59%')
    expect(text(row(0))).toBe('♥ 62%  ✦ 59%')
    expect(text(row(-3))).toBe('♥ 62%  ✦ 59%')
  })

  test('bars = all: the full words only in the full form, then the short ones to the end', () => {
    expect(text(row(111, 'all')).endsWith(`ctx · 82k/200k   ⏾77% · ${RESET}   ◉ $1.84`)).toBe(true)
    expect(cellWidth(row(111, 'all'))).toBe(111)
    expect(text(row(110, 'all'))).toBe(`♥ HP █████████░░░░░ 62% heals 2d 4h   ✦ MP ████████░░░░░░ 59% 82k/200k  ⏾77% · ${RESET}  ◉$1.84`)
    expect(text(row(56, 'all'))).toBe('♥ HP ██████░░░░ 62%   ✦ MP ██████░░░░ 59%  ⏾77%  ◉$1.84')
    expect(text(row(27, 'all'))).toBe('♥ 62%  ✦ 59%  ⏾77%  ◉$1.84')
  })

  test('the reset time stays while the row has words, and goes with them', () => {
    const tight = { ...measured, fiveHourUsed: 92 }
    expect(text(row(67, 'hpmp', tight))).toBe(`♥ HP ██████░░░░ 62% heals 2d 4h   ✦ MP ██████░░░░ 59%  ⏾8% · ${RESET}`)
    expect(text(row(48, 'hpmp', tight))).toBe('♥ HP ██████░░░░ 62%   ✦ MP ██████░░░░ 59%  ⏾8%')
    expect(text(row(18, 'hpmp', tight))).toBe('♥ 62%  ✦ 59%  ⏾8%')
  })

  test('⏾ takes one cell: no character the row draws is an emoji', () => {
    expect(cellWidth([{ text: '⏾5h', tone: 'hp' }])).toBe(3)
    expect(cellWidth([{ text: '♥ █░', tone: 'hp' }, { text: ' 62%', tone: 'hp' }])).toBe(8)
    expect(cellWidth(row(84, 'all'))).toBe(84)
  })

  test('no HP: the MP row takes the room, and its token count stays longer', () => {
    const noHp = fromMeasure({ context: { tokens: 82_000, window: 200_000, percent: 41 }, rateLimits: [] })
    expect(text(row(38, 'hpmp', noHp))).toBe('✦ MP ████████░░░░░░ 59% ctx · 82k/200k')
    expect(text(row(32, 'hpmp', noHp))).toBe('✦ MP ████████░░░░░░ 59% 82k/200k')
    expect(text(row(19, 'hpmp', noHp))).toBe('✦ MP ██████░░░░ 59%')
    expect(text(row(5, 'hpmp', noHp))).toBe('✦ 59%')
  })

  test('no token count or heal time yet: no gap left behind, and no words made up', () => {
    const bare: Meters = { window: 200_000, weekUsed: 38 }
    expect(text(row(59, 'hpmp', bare))).toBe('♥ HP █████████░░░░░ 62% week   ✦ MP ██████████████ 100% ctx')
    expect(text(row(58, 'hpmp', bare))).toBe('♥ HP █████████░░░░░ 62%   ✦ MP ██████████████ 100%')
    expect(text(row(31, 'hpmp', bare))).toBe('♥ █████░░░ 62%  ✦ ████████ 100%')
  })

  test('each form keeps its tones', () => {
    const tones = (room: number) => row(room).map(segment => segment.tone)
    expect(tones(62)).toEqual(['hp', 'hp', 'hp', 'dim', 'mp', 'mp', 'mp', 'dim'])
    const low = bandModel(quest, [], { window: 200_000, weekUsed: 85 }, 'hpmp', NOW, 12).meters
    expect(low.filter(segment => segment.text.includes('15%') || segment.text.startsWith('♥')).map(segment => segment.tone)).toEqual(['hpCritical', 'hpCritical'])
  })

  // The widest figures there are, in every combination: nothing may overflow, so nothing is cut.
  // `all` draws a full 5-hour window; `hpmp` draws it once it binds, at most 99% left.
  const WIDEST: Meters = { window: 1_000_000, contextPercent: 0, contextTokens: 1_250_000, weekUsed: 0, weekResetsAt: '2026-11-08T07:30:00Z', fiveHourUsed: 0, fiveHourResetsAt: '2026-11-01T14:30:00Z', costUsd: 123.45 }
  const binding: Meters = { ...WIDEST, fiveHourUsed: 1 }
  const noWeek: Meters = { window: 1_000_000, contextPercent: 0, contextTokens: 1_250_000, fiveHourUsed: 61, fiveHourResetsAt: '2026-11-01T14:30:00Z', costUsd: 123.45 }

  for (const [name, meters, hasHp] of [['with HP', WIDEST, true], ['with HP and a binding 5-hour window', binding, true], ['without HP', noWeek, false]] as const) {
    for (const bars of ['hpmp', 'all'] as const) {
      test(`${name}, bars = ${bars}: from 12 to 130 cells the row fits or is the figures, its percentages whole`, () => {
        const figures = cellWidth(row(0, bars, meters))

        for (let room = 12; room <= 130; room++) {
          const drawn = row(room, bars, meters)

          expect(cellWidth(drawn) <= room || cellWidth(drawn) === figures).toBe(true)
          expect(text(drawn).split('100%').length - 1).toBeGreaterThanOrEqual(hasHp ? 2 : 1)
          expect(text(drawn).startsWith(hasHp ? '♥' : '✦')).toBe(true)
          if (bars === 'all') expect(/⏾.*◉/.test(text(drawn))).toBe(true)
          if (meters !== WIDEST || bars === 'all') expect(text(drawn).includes('⏾')).toBe(true)
        }
      })
    }
  }
})

describe('the quest row in the room it has', () => {
  const head = (room: number, onQuest: Quest | null = quest, list: readonly Task[] = tasks) => text(bandModel(onQuest, list, null, 'hpmp', NOW, room).head)
  const ALL = '⚔ gku:implement  Forge  task 1/3 · Write the CSV writer tests'
  const NO_ZONE = '⚔ gku:implement  task 1/3 · Write the CSV writer tests'
  const NO_TASK = '⚔ gku:implement  task 1/3'
  const ALONE = '⚔ gku:implement'

  const steps = [
    [100, ALL],
    [45, ALL],
    [44, NO_ZONE],
    [38, NO_ZONE],
    [37, NO_TASK],
    [25, NO_TASK],
    [24, ALONE],
    [5, ALONE],
    [0, ALONE],
  ] as const

  for (const [room, expected] of steps) {
    test(`${room} cells: ${expected}`, () => {
      expect(head(room)).toBe(expected)
    })
  }

  test('the current task comes last, so it is the piece the engine may cut', () => {
    const row = bandModel(quest, tasks, null, 'hpmp', NOW, 45).head
    expect(row[row.length - 1]).toEqual({ text: ' · Write the CSV writer tests', tone: 'plain' })
  })

  test('a short task needs only its own cells', () => {
    const short: Task[] = [{ id: '1', subject: 'a', status: 'in_progress' }]
    expect(head(36, quest, short)).toBe('⚔ gku:implement  Forge  task 0/1 · a')
    expect(head(35, quest, short)).toBe('⚔ gku:implement  task 0/1 · a')
  })

  test('no tasks: the zone goes when it does not fit', () => {
    expect(head(22, quest, [])).toBe('⚔ gku:implement  Forge')
    expect(head(21, quest, [])).toBe(ALONE)
  })

  test('tasks with none in progress: the count stays as long as it fits', () => {
    const waiting: Task[] = [{ id: '1', subject: 'a', status: 'pending' }]
    expect(head(32, quest, waiting)).toBe('⚔ gku:implement  Forge  task 0/1')
    expect(head(31, quest, waiting)).toBe('⚔ gku:implement  task 0/1')
    expect(head(24, quest, waiting)).toBe(ALONE)
  })

  test('no quest: the Wilds is the zone and it stays', () => {
    expect(head(30, null, tasks)).toBe('Wilds  task 1/3 · Write the CSV writer tests')
    expect(head(27, null, tasks)).toBe('Wilds  task 1/3')
    expect(head(14, null, tasks)).toBe('Wilds')
    expect(head(3, null, [])).toBe('Wilds')
  })
})
