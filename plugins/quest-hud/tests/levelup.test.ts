import { describe, expect, test } from 'claude-code/testing'

import { cardOf, type Inventory } from '../src/harness'
import { CATALOGUE_CHECKED, levelText, levelUpText, MAX_QUESTS, pickQuests, scoutRidesText } from '../src/levelup'
import type { Usage } from '../types'

const inventory = (over: Partial<Inventory> = {}): Inventory => ({
  workedProjects: 0,
  instructedProjects: 0,
  hasGlobalInstructions: false,
  memoryProjects: 0,
  memoryFiles: 0,
  plugins: [],
  skills: [],
  commands: [],
  ownSkills: 0,
  customAgents: 0,
  hasHooks: false,
  hasDenyRules: false,
  hasPermissionRules: false,
  hasAutoMode: false,
  hasProjectSettings: false,
  ...over,
})

const usage = (over: Partial<Usage> = {}): Usage => ({
  isRead: true,
  sessions: 100,
  days: 30,
  editingSessions: 0,
  checkedSessions: 0,
  testRuns: 0,
  lintRuns: 0,
  skillSessions: 0,
  allSessions: 100,
  skillRuns: {},
  agentCalls: 0,
  agentSessions: 0,
  mcpCalls: 0,
  mcpServers: 0,
  browserCalls: 0,
  webCalls: 0,
  ghRuns: 0,
  edits: {},
  ...over,
})

/** All the quests a harness gets, past the limit, and the titles of those shown. */
const titles = (inv: Partial<Inventory>, use: Partial<Usage> = {}): string[] =>
  pickQuests(inventory(inv), usage(use), Infinity).map(quest => quest.title)

const GKU_HERE = { plugins: ['gku'], skills: ['gku:plan', 'gku:audit', 'gku:pr-review', 'gku:review', 'gku:fix'] }

// A well set-up harness gets none of the rows below, so each one's trigger shows alone.
const SET_UP: Partial<Inventory> = {
  ...GKU_HERE,
  plugins: ['gku', 'mattpocock-skills', 'session-report', 'php-lsp', 'context7'],
  workedProjects: 5,
  instructedProjects: 5,
  memoryProjects: 3,
  memoryFiles: 30,
  hasHooks: true,
  hasDenyRules: true,
  hasPermissionRules: true,
}
const USED: Partial<Usage> = { agentCalls: 30, agentSessions: 30, edits: { php: 50 } }

describe('which quests a harness gets', () => {
  test('a well set-up harness gets only the guild', () => {
    expect(titles(SET_UP, USED)).toEqual(["The Guild's Next Skill"])
  })

  const ROWS: ReadonlyArray<readonly [string, Partial<Inventory>, Partial<Usage>]> = [
    ['The Founding Stone', { workedProjects: 5, instructedProjects: 4 }, {}],
    ['The Long Memory', { memoryProjects: 0 }, {}],
    ['The Silent Scribe', { plugins: ['gku', 'mattpocock-skills', 'session-report', 'context7'] }, { edits: { php: 50 } }],
    ['The Gatekeeper', { hasHooks: false }, { testRuns: 5 }],
    ['The Swift Pass', { hasPermissionRules: false, hasDenyRules: false }, {}],
    ['The Ghost Party', {}, { agentCalls: 1, agentSessions: 1 }],
    ['The Grilling', { plugins: ['gku', 'session-report', 'php-lsp', 'context7'] }, {}],
    ['The Method', { plugins: ['session-report', 'php-lsp', 'context7'], skills: [] }, {}],
    ['Second Eyes', { skills: ['gku:plan'], plugins: ['mattpocock-skills', 'session-report', 'php-lsp', 'context7'] }, { ghRuns: 20 }],
    ['The Library Scroll', { plugins: ['gku', 'mattpocock-skills', 'session-report', 'php-lsp'] }, { webCalls: 20 }],
    ['The Looking Glass', {}, { edits: { php: 50, tsx: 20 } }],
    ['The Ledger', { plugins: ['gku', 'mattpocock-skills', 'php-lsp', 'context7'] }, {}],
  ]

  for (const [title, inv, use] of ROWS) {
    test(`${title} has a trigger, and goes away without it`, () => {
      expect(titles({ ...SET_UP, ...inv }, { ...USED, ...use })).toContain(title)
      expect(titles(SET_UP, USED)).not.toContain(title)
    })
  }

  test('a little of something is not yet a quest', () => {
    expect(titles(SET_UP, { ...USED, ghRuns: 19 })).not.toContain('Second Eyes')
    expect(titles(SET_UP, { ...USED, webCalls: 19 })).not.toContain('The Library Scroll')
    expect(titles(SET_UP, { ...USED, edits: { php: 50, tsx: 19 } })).not.toContain('The Looking Glass')
    expect(titles(SET_UP, { ...USED, browserCalls: 4, edits: { php: 50, tsx: 20 } })).not.toContain('The Looking Glass')
    expect(titles({ ...SET_UP, plugins: ['gku', 'mattpocock-skills', 'session-report', 'context7'] }, { ...USED, edits: { php: 9 } })).not.toContain('The Silent Scribe')
  })

  test('a grill installed by hand counts', () => {
    expect(titles({ ...SET_UP, plugins: ['gku', 'session-report', 'php-lsp', 'context7'], skills: [...GKU_HERE.skills, 'grill-me'] }, USED)).not.toContain('The Grilling')
  })

  test('with transcripts unread, nothing is asked of what could not be seen', () => {
    const unread = { isRead: false, sessions: 0 }
    expect(titles(SET_UP, unread)).not.toContain('The Ghost Party')
    expect(titles({ ...SET_UP, hasHooks: false }, unread)).not.toContain('The Gatekeeper')
    expect(titles(SET_UP, { ...unread, edits: { tsx: 90 } })).not.toContain('The Looking Glass')
  })
})

describe('gku', () => {
  const find = (inv: Partial<Inventory>, use: Partial<Usage> = {}) =>
    pickQuests(inventory(inv), usage(use), Infinity).find(quest => quest.title.startsWith('The Guild'))

  test('absent, it says how to install it, and that it is a house pick', () => {
    const quest = find({})
    expect(quest?.title).toBe("The Guild's Skillset")
    expect(quest?.tag).toContain('house pick')
    expect(quest?.act).toEqual(['/plugin marketplace add grinchenkoedu/claude-skills', '/plugin install gku@grinchenkoedu'])
  })

  test('present, it names the skills not tried much, and only those', () => {
    const quest = find(GKU_HERE, { skillRuns: { 'gku:plan': 40, 'gku:review': 3, 'gku:fix': 2, 'gku:audit': 1 } })
    expect(quest?.title).toBe("The Guild's Next Skill")
    expect(quest?.why).toContain('/gku:audit')
    expect(quest?.why).toContain('/gku:fix')
    expect(quest?.why).toContain('/gku:pr-review')
    expect(quest?.why).not.toContain('/gku:plan')
    expect(quest?.why).not.toContain('/gku:review')
  })

  test('every skill tried: no skill named, and the quest stays', () => {
    const quest = find({ plugins: ['gku'], skills: ['gku:plan'] }, { skillRuns: { 'gku:plan': 40 } })
    expect(quest?.title).toBe("The Guild's Next Skill")
    expect(quest?.why).not.toContain('Not yet tried')
  })

  test('it is never dropped, however many quests come first', () => {
    const shown = pickQuests(inventory({ workedProjects: 9 }), usage({ testRuns: 9, ghRuns: 99, webCalls: 99, edits: { php: 99, tsx: 99 } }), MAX_QUESTS)
    expect(shown).toHaveLength(MAX_QUESTS)
    expect(shown.some(quest => quest.title.startsWith('The Guild'))).toBe(true)
  })
})

describe('the order', () => {
  test('the weakest part comes first, side quests last', () => {
    const quests = pickQuests(
      inventory({ ...GKU_HERE, plugins: ['gku'], workedProjects: 5, instructedProjects: 4, memoryProjects: 3, memoryFiles: 30, hasPermissionRules: true }),
      usage({ skillSessions: 90, skillRuns: { a: 1, b: 1, c: 1 }, testRuns: 5 }),
      Infinity,
    )
    const at = (title: string) => quests.findIndex(quest => quest.title === title)
    expect(at('The Ghost Party')).toBeLessThan(at('The Founding Stone'))
    expect(at('The Founding Stone')).toBeLessThan(at('The Grilling'))
    expect(at('The Grilling')).toBeGreaterThan(at("The Guild's Next Skill"))
  })

  test('at most MAX_QUESTS', () => {
    expect(pickQuests(inventory({ workedProjects: 9 }), usage({ testRuns: 9, edits: { php: 99 } }), MAX_QUESTS).length).toBe(MAX_QUESTS)
  })
})

describe('every quest', () => {
  const EVERYTHING = pickQuests(inventory({ workedProjects: 9 }), usage({ testRuns: 9, ghRuns: 99, webCalls: 99, edits: { php: 99, tsx: 99 } }), Infinity)

  test('has a title, a why and a way to act; official plugins by their full name', () => {
    expect(EVERYTHING.length).toBeGreaterThan(9)
    for (const quest of EVERYTHING) {
      expect(quest.title).not.toBe('')
      expect(quest.why).not.toBe('')
      expect(quest.act.length).toBeGreaterThan(0)
      for (const line of quest.act.filter(act => act.startsWith('/plugin install ') && !act.includes('gku@'))) {
        expect(line).toContain('@claude-plugins-official')
      }
    }
  })

  test('the why carries the person\'s numbers', () => {
    const scribe = pickQuests(inventory(), usage({ edits: { php: 678 } }), Infinity).find(quest => quest.title === 'The Silent Scribe')
    expect(scribe?.why).toContain('678 PHP edits')
    expect(scribe?.act).toEqual(['/plugin install php-lsp@claude-plugins-official'])
  })

  test('the docs server says where its questions go', () => {
    expect(EVERYTHING.find(quest => quest.title === 'The Library Scroll')?.why).toContain('Upstash')
  })
})

describe('/quest-hud:level-up', () => {
  test('heads with the next level and the points to it', () => {
    const inv = inventory()
    const text = levelUpText(cardOf(inv, usage()), inv)
    expect(text.split('\n')[0]).toBe('⚔ Quests for level 2   (2 points away)')
  })

  test('one point away is a point', () => {
    const inv = inventory({ workedProjects: 5, instructedProjects: 5 })
    const text = levelUpText(cardOf(inv, usage()), inv)
    expect(text.split('\n')[0]).toBe('⚔ Quests for level 3   (1 point away)')
  })

  test('at the top, the road is walked', () => {
    const inv = inventory({ ...GKU_HERE, ownSkills: 1, customAgents: 1, workedProjects: 5, instructedProjects: 5, memoryProjects: 3, memoryFiles: 20, hasHooks: true, hasDenyRules: true, plugins: ['gku', 'php-lsp'] })
    const use = usage({ skillSessions: 90, skillRuns: { a: 1, b: 1, c: 1 }, editingSessions: 10, checkedSessions: 10, testRuns: 1, lintRuns: 1, mcpCalls: 1, edits: { php: 9 }, agentCalls: 90, agentSessions: 90 })
    expect(levelUpText(cardOf(inv, use), inv).split('\n')[0]).toContain('Level 10')
  })

  test('says commands are printed and never run, and when the list was checked', () => {
    const inv = inventory()
    const text = levelUpText(cardOf(inv, usage()), inv)
    expect(text).toContain('printed, never run')
    expect(text).toContain(CATALOGUE_CHECKED)
    expect(text).toContain('▸ ')
  })
})

describe('/quest-hud:level', () => {
  test('heads with the level, the points and the window, and lists every part', () => {
    const inv = inventory({ memoryProjects: 3, memoryFiles: 20 })
    const text = levelText(cardOf(inv, usage({ sessions: 143, days: 35 })))
    expect(text.split('\n')[0]).toBe('⚔ Level 2 · Apprentice   3/21 · 143 sessions, 35 days')
    expect(text).toContain('  Memory        ███  20 notes in 3 projects')
    expect(text).toContain('  Instructions  ░░░  no project worked in yet')
    expect(text).toContain('not a benchmark')
    expect(text).toContain('/quest-hud:level-up')
  })

  test('says so when usage could not be read', () => {
    const text = levelText(cardOf(inventory(), usage({ isRead: false, sessions: 0 })))
    expect(text.split('\n')[0]).toContain('usage unread')
    expect(text).toContain('  Checks        ···  usage unread')
  })

  test('one session is a session', () => {
    expect(levelText(cardOf(inventory(), usage({ sessions: 1, days: 1 })))).toContain('1 session, 1 day')
  })

  test('the scout says how much it is reading', () => {
    expect(scoutRidesText(143, 3_248_955_873)).toContain('143 sessions, 3.0 GB')
    expect(scoutRidesText(1, 5_000_000)).toContain('1 session, 4.8 MB')
  })
})
