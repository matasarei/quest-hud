// What /quest-hud:sync shows: the person's open GitHub work and alerts, ranked on
// WoW's creature ladder and linked. Pure. Titles come from strangers: they are
// cleaned, drawn only on the board, and never reach a command's answer or the store.
import type { BoardQuest, QuestRank } from '../types'
import { cleanTitle } from './quest'

/** What the board says before its first post, and after a /clear wipes it. */
export const NO_BOARD_TEXT = 'The board is bare. /quest-hud:sync posts your GitHub quests here.'

/** The ladder, highest first. */
export const RANKS: readonly QuestRank[] = ['boss', 'rareElite', 'elite', 'rare', 'normal', 'minion', 'trivial']

/** A quest left alone longer than this drops to Trivial, unless it is an alert or unread. */
export const IDLE_DAYS = 90
/** The most rows a board holds, the highest ranked; the rest are counted. */
export const MAX_QUESTS = 300

const DAY_MS = 86_400_000
const MAX_HREF = 2048

// A whole URL, on github.com's own https, with no query, no fragment and no user part.
const GITHUB_URL = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/

/** The URL if a Link may hold it; anything else goes no further. */
export const safeHref = (url: unknown): string | undefined =>
  typeof url === 'string' && url.length <= MAX_HREF && GITHUB_URL.test(url) && !url.split('/').some(part => part === '.' || part === '..') ? url : undefined

/** A checked link in short, from its own parts: `acme/api#12`. */
export const labelOf = (href: string): string => {
  const [owner = '', repo = '', kind, ...rest] = href.slice('https://github.com/'.length).split('/')
  const name = `${owner}/${repo}`

  if (kind === 'security') return rest.length > 1 ? `${name} alert #${rest.at(-1) ?? ''}` : `${name} alerts`
  if (kind === 'releases') return `${name} releases`

  return kind === undefined || rest[0] === undefined ? name : `${name}#${rest[0]}`
}

/** A quest as a parser finds it, before its link is checked and its title cleaned. */
export type QuestInput = {
  rank: QuestRank
  url: unknown
  title: string
  at: number
  /** Set where one link holds several rows, or one row has several links. */
  id?: string
  order?: number
  why?: string
  isUnread?: boolean
  isSecurity?: boolean
}

/** A row of the board. A date that cannot be read counts as `now`, so it does not sink the quest. */
export const questOf = (input: QuestInput, now = 0): BoardQuest => {
  const href = safeHref(input.url)
  const title = cleanTitle(input.title)

  return {
    id: input.id ?? href ?? `no link|${title}`,
    rank: input.rank,
    order: input.order ?? 0,
    ...(href === undefined ? {} : { href }),
    label: href === undefined ? 'no link' : labelOf(href),
    title,
    why: input.why ?? '',
    at: Number.isNaN(input.at) ? now : input.at,
    isUnread: input.isUnread === true,
    isSecurity: input.isSecurity === true,
  }
}

const rankIndex = (rank: QuestRank): number => RANKS.indexOf(rank)

const merged = (quests: readonly BoardQuest[]): BoardQuest[] => {
  const byId = new Map<string, BoardQuest>()

  for (const quest of quests) {
    const held = byId.get(quest.id)
    const isUnread = quest.isUnread || held?.isUnread === true
    const wins = held === undefined || rankIndex(quest.rank) < rankIndex(held.rank)
    byId.set(quest.id, { ...(wins ? quest : held), isUnread })
  }

  return [...byId.values()]
}

const isHere = (quest: BoardQuest, here: string | undefined): boolean =>
  here !== undefined && quest.href !== undefined && `${quest.href}/`.startsWith(`https://github.com/${here}/`)

/** The board's rows: one per quest, the idle sunk, in ladder order; and how many did not fit. */
export const finishQuests = (quests: readonly BoardQuest[], now: number, here?: string): { quests: BoardQuest[]; left: number } => {
  const sorted = merged(quests)
    .map(quest => (!quest.isSecurity && !quest.isUnread && now - quest.at > IDLE_DAYS * DAY_MS ? { ...quest, rank: 'trivial' as const, order: 0 } : quest))
    .sort((a, b) =>
      rankIndex(a.rank) - rankIndex(b.rank)
      || a.order - b.order
      || Number(isHere(b, here)) - Number(isHere(a, here))
      || b.at - a.at
      || a.id.localeCompare(b.id))

  return { quests: sorted.slice(0, MAX_QUESTS), left: Math.max(0, sorted.length - MAX_QUESTS) }
}

const COUNT_NAME: Readonly<Record<QuestRank, readonly [string, string]>> = {
  boss: ['boss', 'bosses'],
  rareElite: ['rare elite', 'rare elites'],
  elite: ['elite', 'elites'],
  rare: ['rare', 'rare'],
  normal: ['normal', 'normal'],
  minion: ['minion', 'minions'],
  trivial: ['trivial', 'trivial'],
}

/** What the counts come to, in the HUD's own words: no title, no repository. */
export const countsText = (quests: readonly BoardQuest[]): string => {
  const parts = RANKS.flatMap(rank => {
    const count = quests.filter(quest => quest.rank === rank).length
    return count === 0 ? [] : [`${count} ${COUNT_NAME[rank][count === 1 ? 0 : 1]}`]
  })

  return parts.length === 0 ? 'The board is clear.' : `The board is posted: ${parts.join(', ')}`
}

/** How long ago, in one unit. */
export const ageText = (at: number, now: number): string => {
  const minutes = Math.floor((now - at) / 60_000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`

  return minutes < 24 * 60 ? `${Math.floor(minutes / 60)}h` : `${Math.floor(minutes / (24 * 60))}d`
}
