import { describe, expect, test } from 'claude-code/testing'

import { afterPrompt, cleanTitle, fromSkill, ownWords, TITLE_MAX } from '../src/quest'
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

describe('afterPrompt', () => {
  test('a prompt never starts a quest: with no skill running there is none', () => {
    expect(afterPrompt(null, 'make the export handle empty departments', [])).toBe(null)
  })

  test('three words of the person\'s own with nothing open end a skill\'s quest', () => {
    expect(afterPrompt(skillQuest, 'now fix the README', closed)).toBe(null)
    expect(afterPrompt(skillQuest, 'now fix the README', [])).toBe(null)
  })

  test('a follow-up while a task is open keeps the quest', () => {
    expect(afterPrompt(skillQuest, 'also handle empty departments please', open)).toBe(skillQuest)
  })

  test('a short reply keeps the quest even with nothing open', () => {
    expect(afterPrompt(skillQuest, 'go on', closed)).toBe(skillQuest)
    expect(afterPrompt(skillQuest, 'yes', [])).toBe(skillQuest)
  })

  test('a command or an empty prompt changes nothing', () => {
    expect(afterPrompt(skillQuest, '/compact now please ok', [])).toBe(skillQuest)
    expect(afterPrompt(skillQuest, '   ', [])).toBe(skillQuest)
  })

  test('a bare paste never ends the quest', () => {
    expect(afterPrompt(skillQuest, PASTED_BAND, [])).toBe(skillQuest)
  })

  test('only the person\'s own words count: two words and a paste keep the quest', () => {
    expect(afterPrompt(skillQuest, 'see this\n<pasted_content id="3">one two three four</pasted_content id="3">', [])).toBe(skillQuest)
  })
})
