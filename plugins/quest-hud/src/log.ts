// The pane's log: one short line per thing Claude did, from the tool calls
// and events Claude Code reports. Pure: entries in, entries out.
import type { LogEntry, ScoutCounts } from '../types'
import { cleanTitle } from './quest'

export const MAX_LOG = 50

const SCOUT_TOOLS: Readonly<Record<string, keyof ScoutCounts>> = {
  Read: 'reads',
  Grep: 'searches',
  Glob: 'searches',
  WebSearch: 'searches',
  WebFetch: 'pages',
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

/** `read 3 files · 2 searches · 1 page`, leaving out what is zero. */
export const scoutText = ({ reads, searches, pages }: ScoutCounts): string =>
  [
    reads > 0 ? `read ${plural(reads, 'file', 'files')}` : '',
    searches > 0 ? plural(searches, 'search', 'searches') : '',
    pages > 0 ? plural(pages, 'page', 'pages') : '',
  ]
    .filter(part => part !== '')
    .join(' · ')

/** The counts one tool call adds, or undefined for a tool that does not scout. */
export const scoutCounts = (tool: string): ScoutCounts | undefined => {
  const key = SCOUT_TOOLS[tool]
  if (key === undefined) return undefined
  const counts: ScoutCounts = { reads: 0, searches: 0, pages: 0 }
  counts[key] = 1
  return counts
}

/** A path's last segment, as a clean title. */
export const fileName = (path: string): string => cleanTitle(path.slice(path.lastIndexOf('/') + 1) || path)

/**
 * `csv.ts +4 -7` for an Edit or Write, counted from the patch the tool
 * returned; a new file's lines are its content's. Undefined for any other
 * tool, or a result this cannot read.
 */
export const castText = (tool: string, input: unknown, result: unknown): string | undefined => {
  if ((tool !== 'Edit' && tool !== 'Write') || !isRecord(input) || !isRecord(result)) return undefined

  const path = typeof input.file_path === 'string' ? input.file_path : typeof result.filePath === 'string' ? result.filePath : undefined
  if (path === undefined) return undefined

  let added = 0
  let removed = 0
  const hunks = Array.isArray(result.structuredPatch) ? result.structuredPatch : []

  for (const hunk of hunks) {
    const lines = isRecord(hunk) && Array.isArray(hunk.lines) ? hunk.lines : []
    for (const line of lines) {
      if (typeof line !== 'string') continue
      if (line.startsWith('+')) added++
      else if (line.startsWith('-')) removed++
    }
  }

  if (hunks.length === 0 && result.type === 'create' && typeof result.content === 'string') {
    added = result.content === '' ? 0 : result.content.replace(/\n$/, '').split('\n').length
  }

  return `${fileName(path)} +${added} -${removed}`
}

/**
 * The log with one entry more: a scout entry right after another of the same
 * turn merges into it, and the oldest entries go past MAX_LOG.
 */
export const appendEntry = (log: readonly LogEntry[], entry: LogEntry): LogEntry[] => {
  const last = log[log.length - 1]

  if (entry.kind === 'scout' && entry.counts && last?.kind === 'scout' && last.counts && last.turn === entry.turn) {
    const counts: ScoutCounts = {
      reads: last.counts.reads + entry.counts.reads,
      searches: last.counts.searches + entry.counts.searches,
      pages: last.counts.pages + entry.counts.pages,
    }
    return [...log.slice(0, -1), { ...last, at: entry.at, counts, text: scoutText(counts) }]
  }

  return [...log, entry].slice(-MAX_LOG)
}

/** `19:04`, in the machine's own time. */
export const clockTime = (at: number): string => {
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
