import { describe, expect, test } from 'claude-code/testing'

import { NO_FOES } from '../src/bash'
import { bandLine, FLAVOR, tipFor, type FlavorFacts } from '../src/flavor'
import { ZONES } from '../src/zones'

const calm: FlavorFacts = { zone: 'forge', foes: NO_FOES, hp: 62, mp: 59 }
const LOW = { hp: 19, mp: 19 }

describe('tipFor', () => {
  test('says nothing when nothing needs saying', () => {
    expect(tipFor(calm)).toBeUndefined()
  })

  test('a standing monster comes first, the tests before the lint', () => {
    const both = { ...calm, ...LOW, foes: { test: 'standing', lint: 'standing' } } as const
    expect(tipFor(both)).toBe('The monster stands until the tests pass.')
    expect(tipFor({ ...both, foes: { test: 'none', lint: 'standing' } })).toBe('The monster stands until the lint is clean.')
  })

  test('a monster being fought is not a tip: the run has not answered yet', () => {
    expect(tipFor({ ...calm, foes: { test: 'fighting', lint: 'none' } })).toBeUndefined()
  })

  test('then MP, naming the commands that help', () => {
    const tip = tipFor({ ...calm, ...LOW })
    expect(tip).toContain('MP runs low')
    expect(tip).toContain('/compact')
    expect(tip).toContain('/clear')
  })

  test('then HP, naming the command that shows it', () => {
    const tip = tipFor({ ...calm, hp: 19 })
    expect(tip).toContain('HP runs low')
    expect(tip).toContain('/usage')
  })

  test('20% is not yet low, on either bar', () => {
    expect(tipFor({ ...calm, hp: 20, mp: 20 })).toBeUndefined()
  })

  test('an account with no weekly limit has no HP to warn about', () => {
    expect(tipFor({ ...calm, hp: undefined })).toBeUndefined()
  })
})

describe('bandLine', () => {
  test('with no tip, walks through the zone\'s lines, one a step, and comes back round', () => {
    const lines = FLAVOR.forge
    expect(bandLine(calm, 0)).toBe(lines[0] ?? '')
    expect(bandLine(calm, 1)).toBe(lines[1] ?? '')
    expect(bandLine(calm, lines.length)).toBe(lines[0] ?? '')
  })

  test('the zone decides the line', () => {
    expect(bandLine({ ...calm, zone: 'harbour' }, 0)).toBe(FLAVOR.harbour[0] ?? '')
  })

  test('a tip takes every other step, and flavour the rest', () => {
    const low = { ...calm, mp: 10 }
    const tip = tipFor(low)
    expect(bandLine(low, 0)).toBe(tip ?? '')
    expect(bandLine(low, 1)).toBe(FLAVOR.forge[1] ?? '')
    expect(bandLine(low, 2)).toBe(tip ?? '')
  })
})

describe('bandLine, while a tip stands', () => {
  test('every line of the zone still comes round on the turns between tips', () => {
    const low = { ...calm, hp: 10 }
    const lines = FLAVOR.forge
    const shown = new Set<string>()
    for (let step = 1; step < lines.length * 2; step += 2) shown.add(bandLine(low, step))
    expect(shown.size).toBe(lines.length)
  })

  test('the same holds from any start', () => {
    const low = { ...calm, hp: 10 }
    const shown = new Set<string>()
    for (let step = 3615; step < 3615 + FLAVOR.forge.length * 2; step += 2) shown.add(bandLine(low, step))
    expect(shown.size).toBe(FLAVOR.forge.length)
  })
})

describe('the lines', () => {
  const all = ZONES.flatMap(zone => [...FLAVOR[zone]])

  test('every zone has eight, and no line twice', () => {
    for (const zone of ZONES) expect(FLAVOR[zone]).toHaveLength(8)
    expect(new Set(all).size).toBe(all.length)
  })

  test('each fits the band and is plain printable text, tips included', () => {
    const facts: FlavorFacts[] = [
      { ...calm, foes: { test: 'standing', lint: 'none' } },
      { ...calm, foes: { test: 'none', lint: 'standing' } },
      { ...calm, mp: 1 },
      { ...calm, hp: 1 },
    ]
    for (const line of [...all, ...facts.map(tipFor)]) {
      expect(line).toMatch(/^[\x20-\x7e]{1,60}$/)
    }
  })
})
