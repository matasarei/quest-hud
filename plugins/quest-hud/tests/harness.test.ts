import { describe, expect, test } from 'claude-code/testing'

import { asCard, cardOf, commandFacts, enabledPlugins, levelOf, mainLanguage, pointsToNext, settingsFacts, thousands, TITLES, type Inventory } from '../src/harness'
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

const scoreOf = (name: string, inv: Partial<Inventory>, use: Partial<Usage> = {}): number | undefined =>
  cardOf(inventory(inv), usage(use)).parts.find(part => part.name === name)?.score

describe('the level', () => {
  test('0 points is level 1, all of them level 10', () => {
    expect(levelOf(0, 21)).toBe(1)
    expect(levelOf(21, 21)).toBe(10)
  })

  test('climbs without a gap or a fall', () => {
    const levels = Array.from({ length: 22 }, (_, points) => levelOf(points, 21))
    for (let i = 1; i < levels.length; i++) expect((levels[i] as number) - (levels[i - 1] as number)).toBeLessThanOrEqual(1)
    for (let i = 1; i < levels.length; i++) expect(levels[i] as number).toBeGreaterThanOrEqual(levels[i - 1] as number)
    expect([...new Set(levels)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  test('every level has its title', () => {
    expect(TITLES).toHaveLength(10)
    expect(cardOf(inventory(), usage()).title).toBe('Novice')
  })

  test('an empty machine is a novice with no points, out of the whole', () => {
    const card = cardOf(inventory(), usage())
    expect(card.level).toBe(1)
    expect(card.points).toBe(0)
    expect(card.outOf).toBe(21)
    expect(card.parts.map(part => part.name)).toEqual(['Instructions', 'Memory', 'Skills', 'Checks', 'Guardrails', 'Tools', 'Delegation'])
  })

  test('how many points to the next level; none at the top', () => {
    expect(pointsToNext(16, 21)).toBe(2)
    expect(pointsToNext(0, 21)).toBe(2)
    expect(pointsToNext(19, 21)).toBe(1)
    expect(pointsToNext(20, 21)).toBeUndefined()
    expect(pointsToNext(21, 21)).toBeUndefined()
  })
})

describe('the parts, on both sides of each threshold', () => {
  const ROWS: ReadonlyArray<readonly [string, string, number, Partial<Inventory>, Partial<Usage>]> = [
    ['Instructions', 'no project worked in', 0, { workedProjects: 0 }, {}],
    ['Instructions', 'none of them', 0, { workedProjects: 10 }, {}],
    ['Instructions', 'any', 1, { workedProjects: 10, instructedProjects: 1 }, {}],
    ['Instructions', 'just under half', 1, { workedProjects: 100, instructedProjects: 49 }, {}],
    ['Instructions', 'half', 2, { workedProjects: 10, instructedProjects: 5 }, {}],
    ['Instructions', 'just under 80%', 2, { workedProjects: 100, instructedProjects: 79 }, {}],
    ['Instructions', '80%', 3, { workedProjects: 10, instructedProjects: 8 }, {}],

    ['Memory', 'none', 0, {}, {}],
    ['Memory', 'a global CLAUDE.md', 1, { hasGlobalInstructions: true }, {}],
    ['Memory', 'one project', 1, { memoryProjects: 1, memoryFiles: 50 }, {}],
    ['Memory', 'two projects', 1, { memoryProjects: 2, memoryFiles: 50 }, {}],
    ['Memory', 'three projects', 2, { memoryProjects: 3, memoryFiles: 19 }, {}],
    ['Memory', 'three projects, 20 notes', 3, { memoryProjects: 3, memoryFiles: 20 }, {}],

    ['Skills', 'only built-ins', 0, {}, { skillSessions: 90, skillRuns: { x: 1, y: 1, z: 1 } }],
    ['Skills', 'installed, unused', 1, { skills: ['gku:plan'] }, {}],
    ['Skills', 'just under 10%', 1, { skills: ['gku:plan'] }, { skillSessions: 9 }],
    ['Skills', '10%', 2, { skills: ['gku:plan'] }, { skillSessions: 10 }],
    ['Skills', '25%, but two distinct', 2, { skills: ['a'], ownSkills: 1 }, { skillSessions: 25, skillRuns: { a: 1, b: 1 } }],
    ['Skills', '25%, three, none your own', 2, { skills: ['a'] }, { skillSessions: 25, skillRuns: { a: 1, b: 1, c: 1 } }],
    ['Skills', 'just under 25%, three, your own', 2, { skills: ['a'], ownSkills: 1 }, { skillSessions: 24, skillRuns: { a: 1, b: 1, c: 1 } }],
    ['Skills', '25%, three, your own', 3, { skills: ['a'], ownSkills: 1 }, { skillSessions: 25, skillRuns: { a: 1, b: 1, c: 1 } }],
    ['Skills', 'no sessions at all', 1, { skills: ['a'] }, { allSessions: 0 }],

    ['Checks', 'no runs', 0, {}, { editingSessions: 10 }],
    ['Checks', 'runs, none while editing', 1, {}, { testRuns: 1 }],
    ['Checks', 'just under 30%', 1, {}, { editingSessions: 100, checkedSessions: 29, testRuns: 29 }],
    ['Checks', '30%, one kind', 2, {}, { editingSessions: 100, checkedSessions: 30, testRuns: 30 }],
    ['Checks', '30%, both kinds', 3, {}, { editingSessions: 100, checkedSessions: 30, testRuns: 30, lintRuns: 1 }],
    ['Checks', 'both kinds, just under 30%', 1, {}, { editingSessions: 100, checkedSessions: 29, testRuns: 30, lintRuns: 1 }],

    ['Guardrails', 'nothing', 0, {}, {}],
    ['Guardrails', 'permission rules', 1, { hasPermissionRules: true }, {}],
    ['Guardrails', 'auto mode', 1, { hasAutoMode: true }, {}],
    ['Guardrails', 'project settings', 1, { hasProjectSettings: true }, {}],
    ['Guardrails', 'deny rules without a hook', 1, { hasPermissionRules: true, hasDenyRules: true }, {}],
    ['Guardrails', 'a hook', 2, { hasHooks: true }, {}],
    ['Guardrails', 'a hook and deny rules', 3, { hasHooks: true, hasDenyRules: true }, {}],

    ['Tools', 'neither', 0, {}, { edits: { php: 10 } }],
    ['Tools', 'an MCP used', 1, {}, { mcpCalls: 1, edits: { php: 10 } }],
    ['Tools', 'an LSP for another language', 1, { plugins: ['swift-lsp'] }, { edits: { php: 10 } }],
    ['Tools', 'an MCP and an LSP for another', 2, { plugins: ['swift-lsp'] }, { mcpCalls: 1, edits: { php: 10 } }],
    ['Tools', 'the main language\'s LSP', 2, { plugins: ['php-lsp'] }, { edits: { php: 10 } }],
    ['Tools', 'the main language\'s LSP and an MCP', 3, { plugins: ['php-lsp'] }, { mcpCalls: 1, edits: { php: 10 } }],
    ['Tools', 'a plugin that is no LSP', 0, { plugins: ['gku'] }, { edits: { php: 10 } }],

    ['Delegation', 'none', 0, {}, {}],
    ['Delegation', 'any call', 1, {}, { agentCalls: 1, agentSessions: 1 }],
    ['Delegation', 'just under 10%', 1, {}, { agentCalls: 9, agentSessions: 9 }],
    ['Delegation', '10%', 2, {}, { agentCalls: 10, agentSessions: 10 }],
    ['Delegation', '25%, no custom agent', 2, {}, { agentCalls: 25, agentSessions: 25 }],
    ['Delegation', 'a custom agent, under 25%', 2, { customAgents: 1 }, { agentCalls: 24, agentSessions: 24 }],
    ['Delegation', '25% and a custom agent', 3, { customAgents: 1 }, { agentCalls: 25, agentSessions: 25 }],
  ]

  for (const [part, what, expected, inv, use] of ROWS) {
    test(`${part}: ${what} scores ${expected}`, () => expect(scoreOf(part, inv, use)).toBe(expected))
  }
})

describe('the main language', () => {
  test('is the most edited code, whatever else was edited more', () => {
    expect(mainLanguage({ md: 900, png: 800, php: 10, ts: 5 })?.name).toBe('PHP')
    expect(mainLanguage({ php: 10, ts: 7, tsx: 7 })?.name).toBe('TypeScript')
  })

  test('none, when no code was edited', () => {
    expect(mainLanguage({ md: 900 })).toBeUndefined()
    expect(mainLanguage({})).toBeUndefined()
  })
})

describe('transcripts that could not be read', () => {
  const unread = usage({ isRead: false, sessions: 0, skillSessions: 40, skillRuns: { a: 1, b: 1, c: 1 } })
  const rich = inventory({ workedProjects: 10, instructedProjects: 10, memoryProjects: 3, memoryFiles: 20, skills: ['a'], ownSkills: 1, hasHooks: true, hasDenyRules: true, plugins: ['php-lsp'] })

  test('Checks and Delegation are unread, not zero, and the level is out of what is left', () => {
    const card = cardOf(rich, unread)
    expect(card.parts.find(part => part.name === 'Checks')?.score).toBeUndefined()
    expect(card.parts.find(part => part.name === 'Delegation')?.score).toBeUndefined()
    expect(card.outOf).toBe(15)
    expect(card.level).toBeGreaterThan(cardOf(rich, usage()).level - 1)
  })

  test('skills still score from the prompt history', () => {
    expect(cardOf(rich, unread).parts.find(part => part.name === 'Skills')?.score).toBe(3)
  })

  test('the same harness never reads lower for being unread', () => {
    expect(cardOf(rich, unread).level).toBeGreaterThanOrEqual(cardOf(rich, usage()).level)
  })
})

describe('notes', () => {
  test('thousands are marked at any size', () => {
    expect(thousands(7)).toBe('7')
    expect(thousands(999)).toBe('999')
    expect(thousands(1000)).toBe('1,000')
    expect(thousands(1234567)).toBe('1,234,567')
  })

  test('say what was counted, thousands marked, a skill name cleaned', () => {
    const card = cardOf(
      inventory({ skills: ['gku:plan'] }),
      usage({ testRuns: 5520, lintRuns: 3368, skillRuns: { 'gku:plan': 3500, 'bad\u202ename': 1 } }),
    )
    const note = (name: string) => card.parts.find(part => part.name === name)?.note
    expect(note('Checks')).toBe('5,520 test and 3,368 lint runs')
    expect(note('Skills')).toBe('3,501 runs, mostly gku:plan')
    expect(cardOf(inventory({ skills: ['x'] }), usage({ skillRuns: { 'bad\u202ename': 1 } })).parts[2]?.note).toBe('1 run, mostly bad name')
  })

  test('keep each guardrail apart, so a "no" reads on one only', () => {
    const note = (inv: Partial<Inventory>) => cardOf(inventory(inv), usage()).parts.find(part => part.name === 'Guardrails')?.note
    expect(note({ hasPermissionRules: true, hasAutoMode: true })).toBe('no hooks · permission rules · auto mode')
    expect(note({ hasHooks: true, hasPermissionRules: true, hasDenyRules: true })).toBe('hooks · deny rules')
    expect(note({})).toBe('no hooks · no permission rules')
  })

  test('name the missing language server', () => {
    const card = cardOf(inventory(), usage({ mcpCalls: 1, edits: { php: 3 } }))
    expect(card.parts.find(part => part.name === 'Tools')?.note).toBe('MCP used, no PHP language server')
  })
})

describe('a card from the store', () => {
  test('a part that could not be read has no score, and is still a part', () => {
    const card = cardOf(inventory(), usage({ isRead: false }))
    expect(asCard(JSON.parse(JSON.stringify(card)))).toEqual(card)
  })

  test('a card comes back as it went in', () => {
    const card = cardOf(inventory(), usage())
    expect(asCard(JSON.parse(JSON.stringify(card)))).toEqual(card)
  })

  const BAD: ReadonlyArray<readonly [string, unknown]> = [
    ['nothing', undefined],
    ['null', null],
    ['text', 'level 8'],
    ['no parts', { level: 3, title: 'x', points: 1, outOf: 21, usage: {} }],
    ['a level off the scale', { level: 11, title: 'x', points: 1, outOf: 21, parts: [], usage: { isRead: true } }],
    ['no usage', { level: 3, title: 'x', points: 1, outOf: 21, parts: [] }],
    ['usage with nothing in it', { level: 3, title: 'x', points: 1, outOf: 21, parts: [], usage: { isRead: true } }],
    ['usage with a count that is no number', { ...cardOf(inventory(), usage()), usage: { ...usage(), sessions: '9' } }],
    ['usage with no skill runs', { ...cardOf(inventory(), usage()), usage: { ...usage(), skillRuns: null } }],
    ['usage with no edits', { ...cardOf(inventory(), usage()), usage: { ...usage(), edits: 'x' } }],
    ['a part that is no part', { ...cardOf(inventory(), usage()), parts: [{ name: 'x' }] }],
    ['a score that is no number', { ...cardOf(inventory(), usage()), parts: [{ name: 'x', score: '3', note: 'y' }] }],
  ]
  for (const [what, value] of BAD) {
    test(`${what} is no card`, () => expect(asCard(value)).toBeNull())
  }
})

describe('settings, as far as the level reads them', () => {
  const NONE = { hasHooks: false, hasDenyRules: false, hasPermissionRules: false, hasAutoMode: false }

  test('nothing set, or something that is no settings', () => {
    expect(settingsFacts({})).toEqual(NONE)
    expect(settingsFacts(null)).toEqual(NONE)
    expect(settingsFacts('x')).toEqual(NONE)
  })

  test('hooks count when there are some', () => {
    expect(settingsFacts({ hooks: {} }).hasHooks).toBe(false)
    expect(settingsFacts({ hooks: { PostToolUse: [] } }).hasHooks).toBe(true)
  })

  test('rules count when they hold something', () => {
    expect(settingsFacts({ permissions: { allow: [] } }).hasPermissionRules).toBe(false)
    expect(settingsFacts({ permissions: { allow: ['Bash(ls)'] } })).toEqual({ ...NONE, hasPermissionRules: true })
    expect(settingsFacts({ permissions: { ask: ['Bash(rm *)'] } })).toEqual({ ...NONE, hasPermissionRules: true })
    expect(settingsFacts({ permissions: { deny: ['Read(.env)'] } })).toEqual({ ...NONE, hasPermissionRules: true, hasDenyRules: true })
  })

  test('auto mode, either way it is set', () => {
    expect(settingsFacts({ autoMode: { environment: [] } }).hasAutoMode).toBe(true)
    expect(settingsFacts({ permissions: { defaultMode: 'auto' } }).hasAutoMode).toBe(true)
    expect(settingsFacts({ permissions: { defaultMode: 'plan' } }).hasAutoMode).toBe(false)
  })

  test('enabled plugins by name, not this one, not a disabled one', () => {
    expect(enabledPlugins({ enabledPlugins: { 'gku@grinchenkoedu': true, 'php-lsp@claude-plugins-official': true, 'old@x': false, 'quest-hud@quest-hud': true } })).toEqual(['gku', 'php-lsp'])
    expect(enabledPlugins({})).toEqual([])
    expect(enabledPlugins({ enabledPlugins: 'x' })).toEqual([])
  })
})

describe('the command list, as far as the level reads it', () => {
  const command = (name: string, source: 'builtin' | 'plugin' | 'user' | 'mcp', plugin?: string) => ({ name, description: '', source, ...(plugin === undefined ? {} : { plugin }) })

  test('skills are plugins\' and your own; this mod and the built-ins are not', () => {
    const facts = commandFacts([command('clear', 'builtin'), command('gku:plan', 'plugin', 'gku'), command('self-review', 'user'), command('quest-hud:level', 'plugin', 'quest-hud'), command('quest-hud', 'plugin', 'quest-hud'), command('x:y', 'mcp')])
    expect(facts.skills).toEqual(['gku:plan', 'self-review'])
    expect(facts.ownSkills).toBe(1)
    expect(facts.commands).toEqual(['clear', 'gku:plan', 'self-review', 'quest-hud:level', 'quest-hud', 'x:y'])
  })
})
