import { describe, expect, test } from 'claude-code/testing'

import { cleanTitle, fromPrompt, fromSkill, ownWords, TITLE_MAX } from '../src/quest'
import type { Quest, Task } from '../types'

const NOW = 1_000

// The prompt from the live smoke run that became a title: a fence, then a
// paste of the band itself, and not one word of the person's own.
const PASTED_BAND = [
  '```',
  '',
  '<pasted_content id="5672">',
  ' ▄▀▀▄                       [-]',
  '▀▀▀▀▀▀ ⚔ restarted once more with debug  Wilds',
  '▄▀▀▀▀▀ ♥ HP ███████████░░░ 80% week · heals in 1d 13h',
  '</pasted_content id="5672">',
].join('\n')

describe('ownWords', () => {
  test('a prompt that is only a paste has no words of its own', () => {
    expect(ownWords(PASTED_BAND)).toBe('')
  })

  test('words around a paste are kept, the paste is not', () => {
    expect(ownWords('look at this <pasted_content id="1">some log</pasted_content id="1"> and fix it')).toBe('look at this and fix it')
  })

  test('fenced code goes, closed or running to the end', () => {
    expect(ownWords('fix this crash:\n```\nTypeError: x\n```')).toBe('fix this crash:')
    expect(ownWords('why does this fail\n```\nnpm ERR!')).toBe('why does this fail')
  })

  test('an unclosed paste runs to the end', () => {
    expect(ownWords('see <pasted_content id="2">\nwhatever follows')).toBe('see')
  })

  test('lines without a letter are dropped', () => {
    expect(ownWords('▀▀▀▀ ── ▄▄\nrestart the server now')).toBe('restart the server now')
  })

  test('letters of any script count', () => {
    expect(ownWords('виправ експорт CSV')).toBe('виправ експорт CSV')
  })
})

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

  test('a bare paste never retitles the quest, nor starts the first one', () => {
    const typed: Quest = { title: 'restarted once more with debug', zone: 'wilds', startedAt: 1 }
    expect(fromPrompt(typed, PASTED_BAND, [], NOW)).toBe(typed)
    expect(fromPrompt(null, PASTED_BAND, [], NOW)).toBe(null)
  })

  test('the title is the person\'s words, without the paste', () => {
    const quest = fromPrompt(null, 'fix this crash please:\n```\nTypeError: x is undefined\n```', [], NOW)
    expect(quest?.title).toBe('fix this crash please:')
  })

  test('the words counted are the person\'s own: two words and a paste stay a follow-up', () => {
    expect(fromPrompt(skillQuest, 'see this\n<pasted_content id="3">one two three four</pasted_content id="3">', [], NOW)).toBe(skillQuest)
  })
})
