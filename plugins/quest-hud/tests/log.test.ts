import { describe, expect, test } from 'claude-code/testing'

import { appendEntry, castText, clockTime, fileName, MAX_LOG, scoutCounts, scoutText } from '../src/log'
import type { LogEntry } from '../types'

const scout = (tool: string, turn: string | undefined, at = 1): LogEntry => {
  const counts = scoutCounts(tool)!
  return { at, kind: 'scout', text: scoutText(counts), counts, ...(turn === undefined ? {} : { turn }) }
}

describe('scout lines', () => {
  test('three reads and two searches in one turn make one line', () => {
    let log: LogEntry[] = []
    for (const tool of ['Read', 'Grep', 'Read', 'Glob', 'Read']) log = appendEntry(log, scout(tool, 't1'))
    expect(log).toHaveLength(1)
    expect(log[0]?.text).toBe('read 3 files · 2 searches')
  })

  test('singular words, pages from WebFetch, and zeros left out', () => {
    expect(scoutText({ reads: 1, searches: 0, pages: 1 })).toBe('read 1 file · 1 page')
    expect(scoutCounts('WebSearch')).toEqual({ reads: 0, searches: 1, pages: 0 })
    expect(scoutCounts('Bash')).toBeUndefined()
  })

  test('a new turn, or another entry between, starts a new line', () => {
    let log: LogEntry[] = [scout('Read', 't1')]
    log = appendEntry(log, scout('Read', 't2'))
    expect(log).toHaveLength(2)
    log = appendEntry(log, { at: 2, kind: 'cast', text: 'a.ts +1 -0', turn: 't2' })
    log = appendEntry(log, scout('Grep', 't2'))
    expect(log.map(e => e.kind)).toEqual(['scout', 'scout', 'cast', 'scout'])
  })
})

describe('cast lines', () => {
  test('an Edit counts the patch\'s added and removed lines', () => {
    const result = {
      filePath: '/repo/src/export/csv.ts',
      structuredPatch: [
        { oldStart: 1, oldLines: 7, newStart: 1, newLines: 4, lines: [' keep', '+a', '+b', '-x', '-y', '-z', ' keep'] },
        { oldStart: 20, oldLines: 4, newStart: 17, newLines: 4, lines: ['+c', '+d', '-p', '-q', '-r', '-s'] },
      ],
    }
    expect(castText('Edit', { file_path: '/repo/src/export/csv.ts' }, result)).toBe('csv.ts +4 -7')
  })

  test('a new file by Write counts its content\'s lines', () => {
    expect(castText('Write', { file_path: '/repo/bin/hello' }, { type: 'create', filePath: '/repo/bin/hello', content: 'a\nb\nc\n', structuredPatch: [] })).toBe('hello +3 -0')
    expect(castText('Write', { file_path: '/repo/empty' }, { type: 'create', content: '', structuredPatch: [] })).toBe('empty +0 -0')
  })

  test('any other tool, or a result it cannot read, is no line', () => {
    expect(castText('Bash', { command: 'ls' }, {})).toBeUndefined()
    expect(castText('Edit', null, {})).toBeUndefined()
    expect(castText('Edit', {}, {})).toBeUndefined()
    expect(castText('Edit', { file_path: '/a' }, 'no')).toBeUndefined()
  })

  test('a file name is drawn clean', () => {
    expect(fileName('/repo/a\nb.ts')).toBe('a b.ts')
    expect(fileName('plain.ts')).toBe('plain.ts')
  })
})

describe('the log', () => {
  test('stops at MAX_LOG entries, dropping the oldest', () => {
    let log: LogEntry[] = []
    for (let i = 0; i < MAX_LOG + 7; i++) log = appendEntry(log, { at: i, kind: 'task', text: `✓ ${i}` })
    expect(log).toHaveLength(MAX_LOG)
    expect(log[0]?.text).toBe('✓ 7')
  })

  test('clock time is HH:MM', () => {
    expect(clockTime(new Date(2026, 10, 1, 9, 5).getTime())).toBe('09:05')
  })
})
