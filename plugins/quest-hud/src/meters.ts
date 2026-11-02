// The session's figures as bars and words: HP is what is left of the weekly
// window, MP what is left of the context window. Pure: the numbers come in,
// text comes out, and the render hook only lays it out.
import type { Meters, Quest, Task, Zone } from '../types'
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

export type Tone = 'accent' | 'plain' | 'dim' | 'hp' | 'mp' | 'five' | 'gold'

/** The colour each tone is drawn in; undefined is the surface's own text colour. */
export const TONE_COLOR: Readonly<Record<Tone, string | undefined>> = {
  accent: '#c3a6ff',
  plain: undefined,
  dim: undefined,
  hp: '#4fd37a',
  mp: '#5b9bff',
  five: '#f0b43a',
  gold: '#f2d15b',
}

export type Segment = { text: string; tone: Tone }
export type Band = { head: Segment[]; meters: Segment[] }

export const BAND_WIDTH = 14

/** The band's two rows as text segments, each with the tone it is drawn in. */
export const bandModel = (quest: Quest | null, tasks: readonly Task[], meters: Meters | null, bars: Bars, now: number): Band => {
  // A skill's quest names the skill and its zone; with none running, the Wilds.
  const head: Segment[] = quest
    ? [{ text: `⚔ ${quest.title}`, tone: 'accent' }, { text: `  ${ZONE_LABEL[quest.zone]}`, tone: 'dim' }]
    : [{ text: ZONE_LABEL.wilds, tone: 'dim' }]

  const { done, total, current } = progress(tasks)

  if (total > 0) {
    head.push({ text: `  task ${done}/${total}`, tone: 'dim' })
  }

  if (current) {
    head.push({ text: ` · ${cleanTitle(current.subject)}`, tone: 'plain' })
  }

  const row: Segment[] = []
  const hp = hpLeft(meters)

  if (hp !== undefined) {
    const heals = healsIn(meters?.weekResetsAt, now)
    row.push(
      { text: '♥ HP ', tone: 'hp' },
      { text: bar(hp, BAND_WIDTH), tone: 'hp' },
      { text: ` ${hp}%`, tone: 'hp' },
      { text: heals ? ` week · heals in ${heals}   ` : ' week   ', tone: 'dim' },
    )
  }

  const mp = mpLeft(meters)
  const tokens = meters?.contextTokens

  row.push(
    { text: '✦ MP ', tone: 'mp' },
    { text: bar(mp, BAND_WIDTH), tone: 'mp' },
    { text: ` ${mp}%`, tone: 'mp' },
    { text: tokens !== undefined && meters ? ` ctx · ${shortTokens(tokens)}/${shortTokens(meters.window)}` : ' ctx', tone: 'dim' },
  )

  if (bars === 'all' && meters?.fiveHourUsed !== undefined) {
    row.push({ text: `   ⚡5h ${Math.round(meters.fiveHourUsed)}%`, tone: 'five' })
  }

  if (bars === 'all' && meters?.costUsd !== undefined) {
    row.push({ text: `   ◉ $${meters.costUsd.toFixed(2)}`, tone: 'gold' })
  }

  return { head, meters: row }
}

/** The pieces of the one-line forms, for each form to put in its own order. */
const lineParts = (quest: Quest | null, tasks: readonly Task[], meters: Meters | null, bars: Bars) => {
  const { done, total } = progress(tasks)
  const hp = hpLeft(meters)
  const mp = mpLeft(meters)

  return {
    work: quest ? [`⚔ ${quest.title}${total > 0 ? ` ${done}/${total}` : ''}`] : total > 0 ? [`task ${done}/${total}`] : [],
    gauges: [...(hp === undefined ? [] : [`♥${bar(hp, 10, '▰', '▱')} ${hp}%`]), `✦${bar(mp, 10, '▰', '▱')} ${mp}%`],
    extras: [
      ...(bars === 'all' && meters?.fiveHourUsed !== undefined ? [`⚡${Math.round(meters.fiveHourUsed)}%`] : []),
      ...(bars === 'all' && meters?.costUsd !== undefined ? [`◉$${meters.costUsd.toFixed(2)}`] : []),
    ],
  }
}

/** The one-line form, for /quest-hud:status. */
export const statusText = (quest: Quest | null, tasks: readonly Task[], meters: Meters | null, bars: Bars): string => {
  const { work, gauges, extras } = lineParts(quest, tasks, meters, bars)

  return [...work, ...gauges, ...extras].join(' ')
}

/**
 * The same figures for the prompt's hint line, the bars first: the row cuts from
 * the right, and a quest's title can be long.
 */
export const hintText = (quest: Quest | null, tasks: readonly Task[], meters: Meters | null, bars: Bars): string => {
  const { work, gauges, extras } = lineParts(quest, tasks, meters, bars)

  return [...gauges, ...work, ...extras].join(' ')
}
