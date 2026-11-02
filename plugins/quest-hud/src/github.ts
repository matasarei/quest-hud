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
  if (kind === 'commit') return `${name}@${(rest[0] ?? '').slice(0, 7)}`

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

type Json = Readonly<Record<string, unknown>>

const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value)
const asObject = (value: unknown): Json => (isObject(value) ? value : {})
const objects = (value: unknown): Json[] => (Array.isArray(value) ? value.filter(isObject) : [])
const text = (value: unknown): string => (typeof value === 'string' ? value : '')
const parsed = (stdout: string): unknown => {
  try {
    return JSON.parse(stdout) as unknown
  } catch {
    return undefined
  }
}

const MAX_REPOS = 100
const MAX_ALERTS_PER_REPO = 50
const MAX_OPEN_PER_REPO = 10
const MAX_SEARCH = 30

const pullFields = 'title url updatedAt isDraft author { __typename login }'
const searchOf = (query: string, fields: string, type = 'ISSUE'): string => `search(query:"${query}", type:${type}, first:${MAX_SEARCH}) { issueCount discussionCount nodes { ${fields} } }`
const onItem = (fields: string): string => `... on Issue { ${fields} } ... on PullRequest { ${fields} }`

/** One read: the person's repositories with what is open in them, and what GitHub's search knows of them. */
export const SWEEP_QUERY = `query {
  viewer {
    login
    repositories(first:${MAX_REPOS}, affiliations:[OWNER,ORGANIZATION_MEMBER], ownerAffiliations:[OWNER,ORGANIZATION_MEMBER], isArchived:false, orderBy:{field:PUSHED_AT,direction:DESC}) {
      totalCount
      nodes {
        nameWithOwner
        viewerPermission
        vulnerabilityAlerts(states:OPEN, first:${MAX_ALERTS_PER_REPO}) { totalCount nodes { number createdAt securityVulnerability { severity package { name } } securityAdvisory { summary } } }
        issues(states:OPEN, first:${MAX_OPEN_PER_REPO}, orderBy:{field:UPDATED_AT,direction:DESC}) { totalCount nodes { title url updatedAt } }
        pullRequests(states:OPEN, first:${MAX_OPEN_PER_REPO}, orderBy:{field:UPDATED_AT,direction:DESC}) { totalCount nodes { ${pullFields} } }
      }
    }
  }
  review: ${searchOf('is:open is:pr review-requested:@me archived:false', '... on PullRequest { title url updatedAt }')}
  mine: ${searchOf('is:open is:pr author:@me archived:false', `... on PullRequest { ${pullFields} reviewDecision mergeable commits(last:1) { nodes { commit { statusCheckRollup { state } } } } }`)}
  assigned: ${searchOf('is:open is:issue assignee:@me archived:false', '... on Issue { title url updatedAt }')}
  authored: ${searchOf('is:open is:issue author:@me archived:false', '... on Issue { title url updatedAt }')}
  mentioned: ${searchOf('is:open mentions:@me archived:false', onItem('title url updatedAt comments(last:1) { nodes { author { login } } }'))}
  questions: ${searchOf('involves:@me is:open', '... on Discussion { title url updatedAt isAnswered category { isAnswerable } repository { viewerPermission } }', 'DISCUSSION')}
}`

/** The sweep, as gh runs it. A graphql read, though gh sends it by POST. */
export const SWEEP_ARGV: readonly string[] = ['gh', 'api', 'graphql', '--hostname', 'github.com', '-f', `query=${SWEEP_QUERY}`]

/** The unread notifications, as gh runs them; the fields kept are the ones parseNotifications reads. */
export const NOTIFICATIONS_ARGV: readonly string[] = [
  'gh', 'api', 'notifications?per_page=50', '--hostname', 'github.com',
  '--jq', '[.[] | {reason, updated_at, title: .subject.title, type: .subject.type, url: .subject.url, repo: .repository.full_name}]',
]

const WRITERS: ReadonlySet<string> = new Set(['ADMIN', 'MAINTAIN', 'WRITE'])
const BOSS_SEVERITY: Readonly<Record<string, number>> = { CRITICAL: 1, HIGH: 2 }
/** In Normal: alerts, then open work, then drafts. */
const ORDER = { alert: 0, open: 1, draft: 2 } as const

const timeOf = (value: unknown): number => Date.parse(text(value))
const capitalised = (word: string): string => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`

/** Dependabot's alerts in one repository: one row per package and rank, reading as its worst. */
const alertRows = (repo: string, nodes: readonly Json[]): QuestInput[] => {
  const groups = new Map<string, { rank: QuestRank; order: number; severity: string; name: string; alerts: Json[] }>()

  for (const node of nodes) {
    const vulnerability = asObject(node.securityVulnerability)
    const severity = text(vulnerability.severity)
    const name = text(asObject(vulnerability.package).name)
    const bossOrder = BOSS_SEVERITY[severity]
    const rank: QuestRank = bossOrder === undefined ? 'normal' : 'boss'
    const key = `${rank}|${name}`
    const group = groups.get(key) ?? { rank, order: bossOrder ?? ORDER.alert, severity, name, alerts: [] }
    group.alerts.push(node)
    if ((bossOrder ?? ORDER.alert) < group.order) Object.assign(group, { order: bossOrder, severity })
    groups.set(key, group)
  }

  return [...groups.values()].map(({ rank, order, severity, name, alerts }) => {
    const [first] = alerts
    const page = `https://github.com/${repo}/security/dependabot`
    const newest = Math.max(...alerts.map(item => timeOf(item.createdAt)))

    return alerts.length === 1
      ? { rank, order, url: `${page}/${String(first?.number)}`, title: `${capitalised(severity)}: ${name}, ${text(asObject(first?.securityAdvisory).summary)}`, at: newest, isSecurity: true }
      : { rank, order, url: page, id: `${page}|${rank}|${name}`, title: `${alerts.length} alerts, ${severity.toLowerCase()}: ${name}`, at: newest, isSecurity: true }
  })
}

const whyBlocked = (pull: Json): string => {
  if (pull.isDraft === true) return ''

  const checks = text(asObject(asObject(asObject(objects(asObject(pull.commits).nodes)[0]).commit).statusCheckRollup).state)

  return [
    pull.reviewDecision === 'CHANGES_REQUESTED' ? 'changes requested' : '',
    checks === 'FAILURE' || checks === 'ERROR' ? 'CI failed' : '',
    pull.mergeable === 'CONFLICTING' ? 'conflict' : '',
  ].filter(Boolean).join(', ')
}

const isReady = (pull: Json): boolean =>
  pull.isDraft !== true
  && pull.reviewDecision === 'APPROVED'
  && pull.mergeable === 'MERGEABLE'
  && text(asObject(asObject(asObject(objects(asObject(pull.commits).nodes)[0]).commit).statusCheckRollup).state) === 'SUCCESS'

const mineRow = (pull: Json): Omit<QuestInput, 'url' | 'title' | 'at'> => {
  const blocked = whyBlocked(pull)

  if (blocked !== '') return { rank: 'elite', why: blocked }
  if (isReady(pull)) return { rank: 'rare', why: 'approved and green' }

  return pull.isDraft === true ? { rank: 'normal', order: ORDER.draft, why: 'draft' } : { rank: 'normal', order: ORDER.open }
}

const openPullRow = (pull: Json): Omit<QuestInput, 'url' | 'title' | 'at'> => {
  if (asObject(pull.author).__typename === 'Bot') return { rank: 'minion', why: 'bot' }

  return pull.isDraft === true ? { rank: 'normal', order: ORDER.draft, why: 'draft' } : { rank: 'normal', order: ORDER.open }
}

const itemRow = (item: Json, row: Omit<QuestInput, 'url' | 'title' | 'at'>): QuestInput => ({ ...row, url: item.url, title: text(item.title), at: timeOf(item.updatedAt) })

/** What the sweep came to. `refused` counts what GitHub would not answer; `isCut`, a list longer than was asked for. */
export type Sweep = { login: string; repos: string[]; repoTotal: number; quests: BoardQuest[]; refused: number; isCut: boolean }

/** The sweep's answer, partial or whole; undefined when it holds nothing to read. */
export const parseSweep = (stdout: string, now: number): Sweep | undefined => {
  const answer = parsed(stdout)
  if (!isObject(answer) || !isObject(answer.data)) return undefined

  const { data } = answer
  const viewer = asObject(data.viewer)
  const login = text(viewer.login)
  const set = asObject(viewer.repositories)
  const repoNodes = objects(set.nodes)
  const nodes = (key: string): Json[] => objects(asObject(data[key]).nodes)
  const inputs: QuestInput[] = []
  let isCut = typeof set.totalCount === 'number' && set.totalCount > repoNodes.length

  const noteCut = (list: unknown): Json[] => {
    const { totalCount, nodes: items } = asObject(list)
    const found = objects(items)
    if (typeof totalCount === 'number' && totalCount > found.length) isCut = true
    return found
  }

  for (const repo of repoNodes) {
    const name = text(repo.nameWithOwner)
    inputs.push(...alertRows(name, noteCut(repo.vulnerabilityAlerts)))
    const issues = noteCut(repo.issues)
    const pulls = noteCut(repo.pullRequests)

    if (WRITERS.has(text(repo.viewerPermission))) {
      inputs.push(...issues.map(issue => itemRow(issue, { rank: 'normal', order: ORDER.open })), ...pulls.map(pull => itemRow(pull, openPullRow(pull))))
    }
  }

  for (const key of ['review', 'mine', 'assigned', 'authored', 'mentioned', 'questions']) {
    const { issueCount, discussionCount } = asObject(data[key])
    const count = key === 'questions' ? discussionCount : issueCount
    if (typeof count === 'number' && count > nodes(key).length) isCut = true
  }

  inputs.push(
    ...nodes('review').map(pull => itemRow(pull, { rank: 'rareElite', why: 'review requested' })),
    ...nodes('mine').map(pull => itemRow(pull, mineRow(pull))),
    ...nodes('assigned').map(issue => itemRow(issue, { rank: 'rare', why: 'assigned to you' })),
    ...nodes('authored').map(issue => itemRow(issue, { rank: 'normal', order: ORDER.open })),
    ...nodes('mentioned')
      .filter(item => text(asObject(objects(asObject(item.comments).nodes).at(-1)?.author).login) !== login || login === '')
      .map(item => itemRow(item, { rank: 'rare', why: 'you were mentioned' })),
    ...nodes('questions')
      .filter(item => asObject(item.category).isAnswerable === true && item.isAnswered === false && WRITERS.has(text(asObject(item.repository).viewerPermission)))
      .map(item => itemRow(item, { rank: 'rare', why: 'unanswered question' })),
  )

  return {
    login,
    repos: repoNodes.map(repo => text(repo.nameWithOwner)).filter(name => name !== ''),
    repoTotal: typeof set.totalCount === 'number' ? set.totalCount : repoNodes.length,
    // A search's node that matched no fragment comes back empty: nothing to show.
    quests: inputs.filter(input => input.url !== undefined || input.title !== '').map(input => questOf(input, now)),
    refused: objects(answer.errors).length,
    isCut,
  }
}

const API_SUBJECT = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/(pulls|issues|releases|commits)\/([^/]+)$/
const CALLING_REASONS: ReadonlySet<string> = new Set(['mention', 'team_mention', 'assign'])

/** A notification's page on the web: GitHub gives its API link, or none. */
const subjectPage = (repo: string, url: string, type: string): string => {
  const [, kind, name = ''] = API_SUBJECT.exec(url) ?? []
  const home = `https://github.com/${repo}`

  if (kind === 'pulls') return `${home}/pull/${name}`
  if (kind === 'issues') return `${home}/issues/${name}`
  if (kind === 'commits') return `${home}/commit/${name}`
  if (kind === 'releases') return `${home}/releases`

  return type === 'Discussion' ? `${home}/discussions` : home
}

/** The unread notifications; undefined when they could not be read. A security alert the sweep read is its own row already. */
export const parseNotifications = (stdout: string, now: number, readRepos: ReadonlySet<string>): BoardQuest[] | undefined => {
  const answer = parsed(stdout)
  if (!Array.isArray(answer)) return undefined

  return objects(answer).flatMap(note => {
    const repo = text(note.repo)
    const reason = text(note.reason)
    const url = text(note.url)
    const at = timeOf(note.updated_at)

    if (reason === 'security_alert') {
      if (readRepos.has(repo)) return []
      return [questOf({ rank: 'rare', url: `https://github.com/${repo}/security`, id: `${repo}|alert|${text(note.title)}`, title: text(note.title), why: 'unread alert', at, isUnread: true, isSecurity: true }, now)]
    }

    const page = subjectPage(repo, url, text(note.type))
    const isItsOwnPage = /\/(?:pull|issues)\/[^/]+$/.test(page)

    return [questOf({
      rank: CALLING_REASONS.has(reason) ? 'rare' : 'minion',
      url: page,
      title: text(note.title),
      why: reason === 'mention' || reason === 'team_mention' ? 'unread mention' : reason === 'assign' ? 'unread assignment' : 'unread',
      at,
      isUnread: true,
      ...(isItsOwnPage ? {} : { id: `${repo}|${url}|${text(note.title)}` }),
    }, now)]
  })
}
