import { describe, expect, test } from 'claude-code/testing'

import { cleanTitle, fromPrompt, fromSkill, TITLE_MAX } from '../src/quest'
import type { Quest, Task } from '../types'

const NOW = 1_000

const skillQuest: Quest = { title: 'gku:implement', skill: 'gku:implement', zone: 'forge', startedAt: 1 }
const open: Task[] = [{ id: '1', subject: 'Write the tests', status: 'in_progress' }]
const closed: Task[] = [{ id: '1', subject: 'Write the tests', status: 'completed' }]

describe('cleanTitle', () => {
  test('collapses lines and spaces into one line', () => {
    expect(cleanTitle('  fix the\n\texport   now ')).toBe('fix the export now')
  })

  test('cuts a long title to TITLE_MAX characters with an ellipsis', () => {
    const title = cleanTitle('a'.repeat(100))
    expect([...title]).toHaveLength(TITLE_MAX)
    expect(title.endsWith('…')).toBe(true)
  })

  test('keeps a title of exactly TITLE_MAX characters whole', () => {
    expect(cleanTitle('b'.repeat(TITLE_MAX))).toBe('b'.repeat(TITLE_MAX))
  })

  test('never splits a character made of two code units', () => {
    const title = cleanTitle('😀'.repeat(60))
    expect([...title]).toHaveLength(TITLE_MAX)
    expect(title.includes('\ud83d…')).toBe(false)
  })

  test('drops control characters and bidirectional overrides', () => {
    expect(cleanTitle('ok\u0007 \u202edrow\u202c\u2066x\u2069')).toBe('ok drow x')
  })
})

describe('fromSkill', () => {
  test('titles the quest by the skill and keeps its zone', () => {
    expect(fromSkill('gku:plan', 'map', NOW)).toEqual({ title: 'gku:plan', skill: 'gku:plan', zone: 'map', startedAt: NOW })
  })
})

describe('fromPrompt', () => {
  test('the first prompt of a session titles a quest in the Wilds', () => {
    expect(fromPrompt(null, 'yes', [], NOW)).toEqual({ title: 'yes', zone: 'wilds', startedAt: NOW })
  })

  test('a command never titles a quest', () => {
    expect(fromPrompt(null, '/compact', [], NOW)).toBe(null)
    expect(fromPrompt(skillQuest, '  /gku:pr', [], NOW)).toBe(skillQuest)
  })

  test('an empty prompt changes nothing', () => {
    expect(fromPrompt(skillQuest, '   ', [], NOW)).toBe(skillQuest)
  })

  test('a follow-up while a task is open keeps the quest', () => {
    expect(fromPrompt(skillQuest, 'also handle empty departments please', open, NOW)).toBe(skillQuest)
  })

  test('a short follow-up keeps the quest even with no open task', () => {
    expect(fromPrompt(skillQuest, 'go on', closed, NOW)).toBe(skillQuest)
  })

  test('three words or more with nothing open start a new quest', () => {
    expect(fromPrompt(skillQuest, 'now fix the README', closed, NOW)).toEqual({ title: 'now fix the README', zone: 'wilds', startedAt: NOW })
    expect(fromPrompt(skillQuest, 'now fix the README', [], NOW)?.title).toBe('now fix the README')
  })
})
