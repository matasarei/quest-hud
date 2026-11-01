// The subagents at work, as companions behind the avatar: read from what
// $.agent.list() answers, kept while they are pending, running or waiting.
import type { Companion } from '../types'
import { cleanTitle } from './quest'

const AT_WORK: ReadonlySet<string> = new Set(['pending', 'running', 'waiting'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * The agents still at work, in the order listed, each with its type as a
 * clean label (Explore, rpg:fork-hand); a record this cannot read is left out.
 */
export const activeCompanions = (records: readonly unknown[]): Companion[] =>
  records.flatMap(record => {
    if (!isRecord(record) || typeof record.id !== 'string' || !AT_WORK.has(String(record.status))) return []
    const type = typeof record.type === 'string' && record.type.trim() !== '' ? cleanTitle(record.type) : 'agent'
    return [{ id: record.id, type }]
  })

/** Whether two lists name the same agents with the same labels, so an unchanged list is not written again. */
export const sameCompanions = (a: readonly Companion[], b: readonly Companion[]): boolean =>
  a.length === b.length && a.every((companion, i) => companion.id === b[i]?.id && companion.type === b[i]?.type)
