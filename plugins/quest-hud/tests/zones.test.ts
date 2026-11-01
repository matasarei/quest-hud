import { describe, expect, test } from 'claude-code/testing'

import { parseZones, tokens, zoneFor } from '../src/zones'

// The skills of one real pack (grinchenkoedu/claude-skills), names and the
// start of each description as its SKILL.md has them: a check that a pack the
// HUD knows nothing about lands in sensible zones with no setup.
const GKU: ReadonlyArray<readonly [string, string, string]> = [
  ['gku:plan', 'Turn a request — a sentence you type, or a markdown brief — into a grounded plan', 'map'],
  ['gku:research', 'Find the right answer across this repository and the internet', 'map'],
  ['gku:implement', 'Build a task step by step in the current session — from a plan file', 'forge'],
  ['gku:fix', 'Fix what is wrong — the findings from a review still in this conversation', 'forge'],
  ['gku:review', 'Review your own changes before you push or open a pull request', 'arena'],
  ['gku:verify', 'Check that a change actually works — run the project\'s tests', 'arena'],
  ['gku:audit', 'Audit a whole repository — not a diff — against the rules', 'dungeon'],
  ['gku:pr', 'Open a pull request for the current branch, or update the one already linked to it', 'harbour'],
  ['gku:pr-resolve', 'Work through the review comments on your own pull request', 'harbour'],
  ['gku:pr-review', 'Deep review of someone else\'s pull request in an isolated worktree', 'watchtower'],
  ['gku:init', 'Write or refresh this repository\'s CLAUDE.md', 'camp'],
]

const QUEST = 'Take a quest — one piece of work that ends in one merged pull request. The Daemon scries, casts (implements, commit per step), holds the trial (lint, tests, review, security)'

describe('zoneFor', () => {
  for (const [skill, description, zone] of GKU) {
    test(`${skill} lands in ${zone}`, () => {
      expect(zoneFor(skill, description)).toBe(zone)
    })
  }

  test('a name that matches nothing falls through to its description', () => {
    expect(zoneFor('rpg:quest', QUEST)).toBe('harbour')
  })

  test('an override wins, by the bare name or the full one', () => {
    expect(zoneFor('rpg:quest', QUEST, parseZones('quest=forge'))).toBe('forge')
    expect(zoneFor('rpg:quest', QUEST, parseZones('rpg:quest=camp'))).toBe('camp')
    expect(zoneFor('other:quest', QUEST, parseZones('rpg:quest=camp'))).toBe('harbour')
  })

  test('only whole words match: print and prompt are not pr', () => {
    expect(zoneFor('print-report', '')).toBe('wilds')
    expect(zoneFor('prompt-tools:prompt', 'Prints a prompt')).toBe('wilds')
  })

  test('the plugin prefix is not read as the skill name', () => {
    expect(zoneFor('deploy-kit:hello', 'Says hello')).toBe('wilds')
  })

  test('no skill, an empty name, or nothing matched is the Wilds', () => {
    expect(zoneFor(undefined)).toBe('wilds')
    expect(zoneFor('  ')).toBe('wilds')
    expect(zoneFor('weather', 'Tells the weather')).toBe('wilds')
  })

  test('the name decides before the description', () => {
    expect(zoneFor('plan', 'Then open a pull request')).toBe('map')
  })

  test('review with mr in the name is the Watchtower too', () => {
    expect(zoneFor('glab:mr-review', '')).toBe('watchtower')
  })
})

describe('parseZones', () => {
  test('reads several entries, trimmed and lower-cased', () => {
    const overrides = parseZones(' Deploy = Harbour, triage=map ')
    expect([...overrides.entries()]).toEqual([['deploy', 'harbour'], ['triage', 'map']])
  })

  test('skips entries with no zone, an unknown zone, or more than one =', () => {
    expect(parseZones('a=, =map, b=castle, c=map=forge, d').size).toBe(0)
  })

  test('an empty option is no overrides', () => {
    expect(parseZones('').size).toBe(0)
  })
})

describe('tokens', () => {
  test('splits on anything that is not a letter or digit', () => {
    expect(tokens('gku:pr-review v2_beta')).toEqual(['gku', 'pr', 'review', 'v2', 'beta'])
  })
})
