// The session's figures as bars and words: HP is what is left of the weekly
// window, MP what is left of the context window. Pure: the numbers come in,
// text comes out, and the render hook only lays it out.
import type { Meters, Quest, Task, Zone } from '../types'
import { clockTime } from './log'
import { cleanTitle } from './quest'
import { progress } from './tasks'

/** What `session.measure` pushes and `$.session.usage()` answers, as far as the HUD reads it. */
export type UsageLike = {
  context: { tokens?: number; window: number; percent?: number }
  rateLimits: ReadonlyArray<{ kind: string; percentUsed: number; resetsAt?: string }>
  cost?: { usd: number }
}

export type Bars = 'hpmp' | 'all'

export const ZONE_LABEL: Readonly<Record<Zone, string>> = {
  watchtower: 'Watchtower',
  harbour: 'Harbour',
  dungeon: 'Dungeon',
  arena: 'Arena',
  forge: 'Forge',
  map: 'Map room',
  camp: 'Camp',
  wilds: 'Wilds',
}

/** What each zone stands for, said once where there is room: the pane and /quest-hud:status. */
export const ZONE_MEANING: Readonly<Record<Zone, string>> = {
  watchtower: "reviewing someone else's change",
  harbour: 'pull requests and releases',
  dungeon: 'auditing the whole repository',
  arena: 'review and tests',
  forge: 'building and fixing',
  map: 'planning and research',
  camp: 'setup and docs',
  wilds: 'no skill running',
}

/** `Map room — planning and research`. */
export const zoneLine = (zone: Zone): string => `${ZONE_LABEL[zone]} — ${ZONE_MEANING[zone]}`

const clamp = (value: number): number => Math.min(100, Math.max(0, value))

export const fromMeasure = (usage: UsageLike): Meters => {
  const week = usage.rateLimits.find(limit => limit.kind === 'seven_day')
  const fiveHour = usage.rateLimits.find(limit => limit.kind === 'five_hour')
  const meters: Meters = { window: usage.context.window }

  if (usage.context.percent !== undefined) meters.contextPercent = usage.context.percent
  if (usage.context.tokens !== undefined) meters.contextTokens = usage.context.tokens
  if (week) meters.weekUsed = week.percentUsed
  if (week?.resetsAt !== undefined) meters.weekResetsAt = week.resetsAt
  if (fiveHour) meters.fiveHourUsed = fiveHour.percentUsed
  if (fiveHour?.resetsAt !== undefined) meters.fiveHourResetsAt = fiveHour.resetsAt
  if (usage.cost) meters.costUsd = usage.cost.usd

  return meters
}

/**
 * Percent of the context window left. The engine reports the fill only from the
 * first response of the live window: before it, nothing is spent and MP is full.
 */
export const mpLeft = (meters: Meters | null): number =>
  meters?.contextPercent === undefined ? 100 : Math.round(clamp(100 - meters.contextPercent))

/** Percent of the weekly window left; undefined where the account reports none. */
export const hpLeft = (meters: Meters | null): number | undefined =>
  meters?.weekUsed === undefined ? undefined : Math.round(clamp(100 - meters.weekUsed))

/** The tone HP is drawn in, from the percent left as shown: yellow below 40, red below 20. */
export const hpTone = (left: number): Tone => (left < 20 ? 'hpCritical' : left < 40 ? 'hpLow' : 'hp')

/** Below this much of the 5-hour window left, `hpmp` draws it too: HP's own yellow line. */
const FIVE_BINDS = 40

/** When the 5-hour window resets, in milliseconds; NaN where it is not known or cannot be read. */
const fiveResets = (meters: Meters | null): number =>
  meters?.fiveHourResetsAt === undefined ? Number.NaN : Date.parse(meters.fiveHourResetsAt)

/**
 * Percent of the 5-hour window left; undefined where the account reports none.
 * A reset already passed is a full window: the engine may not measure again at it.
 */
export const fiveLeft = (meters: Meters | null, now: number): number | undefined => {
  if (meters?.fiveHourUsed === undefined) return undefined

  return fiveResets(meters) <= now ? 100 : Math.round(clamp(100 - meters.fiveHourUsed))
}

/** Whether the 5-hour window is drawn: always with `all`; with `hpmp` once it binds, under 40% left or below HP. */
export const showsFive = (meters: Meters | null, bars: Bars, now: number): boolean => {
  const left = fiveLeft(meters, now)
  const hp = hpLeft(meters)

  if (left === undefined) return false
  return bars === 'all' || left < FIVE_BINDS || (hp !== undefined && left < hp)
}

/**
 * The 5-hour window as drawn, in HP's tones: `⚡30% · 14:30`, the reset as a clock
 * time, which stays right between draws where a countdown would freeze. Without
 * `hasTime`, or with no reset to come, the figure alone. Undefined when not drawn.
 */
export const fiveSegment = (meters: Meters | null, bars: Bars, now: number, hasTime = true): Segment | undefined => {
  const left = fiveLeft(meters, now)
  if (left === undefined || !showsFive(meters, bars, now)) return undefined

  const resets = fiveResets(meters)
  const time = hasTime && resets > now ? ` · ${clockTime(resets)}` : ''

  return { text: `⚡${left}%${time}`, tone: hpTone(left) }
}

/** A bar of `width` cells, `left` percent of them full. */
export const bar = (left: number, width: number, full = '█', empty = '░'): string => {
  const cells = Math.round((clamp(left) / 100) * width)

  return full.repeat(cells) + empty.repeat(width - cells)
}

/** `2d 4h`, `3h 12m`, `45m`, `<1m`; undefined for a time that cannot be read. */
export const healsIn = (resetsAt: string | undefined, now: number): string | undefined => {
  const at = resetsAt === undefined ? Number.NaN : Date.parse(resetsAt)

  if (Number.isNaN(at)) {
    return undefined
  }

  const minutes = Math.floor(Math.max(0, at - now) / 60_000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  return minutes > 0 ? `${minutes}m` : '<1m'
}

/** `82k`, `1.2M`, `950`. */
export const shortTokens = (tokens: number): string => {
  if (tokens >= 1_000_000) return `${Number((tokens / 1_000_000).toFixed(1))}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}k`
  return String(tokens)
}

export type Tone = 'accent' | 'plain' | 'dim' | 'hp' | 'hpLow' | 'hpCritical' | 'mp' | 'gold'

/** The colour each tone is drawn in; undefined is the surface's own text colour. */
export const TONE_COLOR: Readonly<Record<Tone, string | undefined>> = {
  accent: '#c3a6ff',
  plain: undefined,
  dim: undefined,
  hp: '#4fd37a',
  hpLow: '#f2d15b',
  hpCritical: '#ef5350',
  mp: '#5b9bff',
  gold: '#f2d15b',
}

export type Segment = { text: string; tone: Tone }
export type Band = { head: Segment[]; meters: Segment[] }

export const BAND_WIDTH = 14

/** The cells a row takes: ⚡ is the one wide character the band's own words draw. */
export const cellWidth = (segments: readonly Segment[]): number =>
  segments.reduce((sum, { text }) => sum + [...text].length + (text.match(/⚡/g)?.length ?? 0), 0)

/** A form of the bars row. `notes` is what the words beside the bars say: all of it, in short, the heal time alone, or nothing. */
type MeterForm = { barWidth: number; labels: boolean; notes: 'long' | 'short' | 'heals' | 'none'; gap: string }

const FIGURES: MeterForm = { barWidth: 0, labels: false, notes: 'none', gap: '  ' }

/**
 * Widest first, and the first that fits is drawn: the words go, then the bars
 * shorten, and the percentages stay to the end. The token count goes before the
 * heal time, as the MP bar says what is left and nothing else says when HP returns.
 */
const METER_FORMS: readonly MeterForm[] = [
  { barWidth: BAND_WIDTH, labels: true, notes: 'long', gap: '   ' },
  { barWidth: BAND_WIDTH, labels: true, notes: 'short', gap: '   ' },
  { barWidth: 10, labels: true, notes: 'short', gap: '   ' },
  { barWidth: 10, labels: true, notes: 'heals', gap: '   ' },
  { barWidth: 10, labels: true, notes: 'none', gap: '   ' },
  { barWidth: 8, labels: false, notes: 'none', gap: '  ' },
  { barWidth: 4, labels: false, notes: 'none', gap: '  ' },
  FIGURES,
]

/** The bars row in one form. */
const meterRow = (form: MeterForm, meters: Meters | null, bars: Bars, now: number): Segment[] => {
  const { barWidth, labels, notes, gap } = form
  const gauge = (glyph: string, name: string, left: number, tone: Tone): Segment[] => [
    { text: `${glyph}${labels ? ` ${name}` : ''}${barWidth > 0 ? ' ' : ''}`, tone },
    { text: bar(left, barWidth), tone },
    { text: ` ${left}%`, tone },
  ]
  const row: Segment[] = []
  const hp = hpLeft(meters)

  if (hp !== undefined) {
    const heals = healsIn(meters?.weekResetsAt, now)
    const healNote = notes === 'long'
      ? (heals ? ` week · heals in ${heals}` : ' week')
      : notes !== 'none' && heals ? ` heals ${heals}` : ''

    row.push(...gauge('♥', 'HP', hp, hpTone(hp)), { text: `${healNote}${gap}`, tone: 'dim' })
  }

  const tokens = meters?.contextTokens
  const count = tokens !== undefined && meters ? `${shortTokens(tokens)}/${shortTokens(meters.window)}` : undefined
  const tokenNote = notes === 'long' ? (count ? ` ctx · ${count}` : ' ctx') : notes === 'short' && count ? ` ${count}` : ''

  row.push(...gauge('✦', 'MP', mpLeft(meters), 'mp'), { text: tokenNote, tone: 'dim' })

  // The reset time goes with the words: a form that keeps none draws the figure alone.
  const five = fiveSegment(meters, bars, now, notes !== 'none')
  if (five) row.push({ ...five, text: `${notes === 'long' ? '   ' : '  '}${five.text}` })

  if (bars === 'all' && meters?.costUsd !== undefined) {
    const cost = meters.costUsd.toFixed(2)
    row.push({ text: notes === 'long' ? `   ◉ $${cost}` : `  ◉$${cost}`, tone: 'gold' })
  }

  return row.filter(segment => segment.text !== '')
}

/** The cells worth keeping for the current task: ` · ` and ten of its own. */
const MIN_TASK_CELLS = 13

/**
 * The quest row, for `room` cells: everything, then no zone, then no current
 * task, then the quest alone. The current task comes last, so it is what the
 * engine cuts, and a wide character in it cannot upset this sum.
 */
const headRow = (quest: Quest | null, tasks: readonly Task[], room: number): Segment[] => {
  // A skill's quest names the skill and its zone; with none running, the Wilds.
  const name: Segment[] = [quest ? { text: `⚔ ${quest.title}`, tone: 'accent' } : { text: ZONE_LABEL.wilds, tone: 'dim' }]
  const zone: Segment[] = quest ? [{ text: `  ${ZONE_LABEL[quest.zone]}`, tone: 'dim' }] : []
  const { done, total, current } = progress(tasks)
  const count: Segment[] = total > 0 ? [{ text: `  task ${done}/${total}`, tone: 'dim' }] : []
  const task: Segment[] = current ? [{ text: ` · ${cleanTitle(current.subject)}`, tone: 'plain' }] : []
  const forms: ReadonlyArray<readonly [Segment[], Segment[]]> = [
    [[...name, ...zone, ...count], task],
    [[...name, ...count], task],
    [[...name, ...count], []],
    [name, []],
  ]
  const [fixed, tail] = forms.find(([kept, last]) => cellWidth(kept) + Math.min(MIN_TASK_CELLS, cellWidth(last)) <= room) ?? [name, []]

  return [...fixed, ...tail]
}

/**
 * The band's two rows as text segments, each with the tone it is drawn in, for
 * `room` cells. With no room given, every word.
 */
export const bandModel = (quest: Quest | null, tasks: readonly Task[], meters: Meters | null, bars: Bars, now: number, room = Number.POSITIVE_INFINITY): Band => {
  const form = METER_FORMS.find(candidate => cellWidth(meterRow(candidate, meters, bars, now)) <= room) ?? FIGURES

  return { head: headRow(quest, tasks, room), meters: meterRow(form, meters, bars, now) }
}

/** The pieces of the one-line forms, for each form to put in its own order. */
const lineParts = (quest: Quest | null, tasks: readonly Task[], meters: Meters | null, bars: Bars, now: number) => {
  const { done, total } = progress(tasks)
  const hp = hpLeft(meters)
  const mp = mpLeft(meters)
  const five = fiveSegment(meters, bars, now)

  return {
    work: quest ? [`⚔ ${quest.title}${total > 0 ? ` ${done}/${total}` : ''}`] : total > 0 ? [`task ${done}/${total}`] : [],
    gauges: [...(hp === undefined ? [] : [`♥${bar(hp, 10, '▰', '▱')} ${hp}%`]), `✦${bar(mp, 10, '▰', '▱')} ${mp}%`],
    extras: [
      ...(five ? [five.text] : []),
      ...(bars === 'all' && meters?.costUsd !== undefined ? [`◉$${meters.costUsd.toFixed(2)}`] : []),
    ],
  }
}

/** The one-line form, for /quest-hud:status. */
export const statusText = (quest: Quest | null, tasks: readonly Task[], meters: Meters | null, bars: Bars, now: number): string => {
  const { work, gauges, extras } = lineParts(quest, tasks, meters, bars, now)

  return [...work, ...gauges, ...extras].join(' ')
}

/**
 * The same figures for the prompt's hint line, the bars first: the row cuts from
 * the right, and a quest's title can be long.
 */
export const hintText = (quest: Quest | null, tasks: readonly Task[], meters: Meters | null, bars: Bars, now: number): string => {
  const { work, gauges, extras } = lineParts(quest, tasks, meters, bars, now)

  return [...gauges, ...work, ...extras].join(' ')
}
