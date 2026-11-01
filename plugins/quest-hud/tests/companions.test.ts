import { describe, expect, test } from 'claude-code/testing'

import { activeCompanions, sameCompanions } from '../src/companions'

describe('activeCompanions', () => {
  test('keeps agents that are pending, running or waiting, labelled by type', () => {
    expect(activeCompanions([
      { id: 'a1', type: 'Explore', status: 'running', description: 'find exporters' },
      { id: 'a2', type: 'rpg:fork-hand', status: 'waiting', description: '' },
      { id: 'a3', type: 'Plan', status: 'pending', description: '' },
    ])).toEqual([
      { id: 'a1', type: 'Explore' },
      { id: 'a2', type: 'rpg:fork-hand' },
      { id: 'a3', type: 'Plan' },
    ])
  })

  test('drops agents that are done, failed, killed or idle', () => {
    const done = ['completed', 'failed', 'killed', 'idle'].map((status, i) => ({ id: `d${i}`, type: 'Explore', status }))
    expect(activeCompanions(done)).toEqual([])
  })

  test('a record it cannot read is left out; a missing type is "agent"; a type is drawn clean', () => {
    expect(activeCompanions([null, 'x', { status: 'running' }, { id: 'a', status: 'running' }, { id: 'b', type: 'odd\ntype', status: 'running' }]))
      .toEqual([{ id: 'a', type: 'agent' }, { id: 'b', type: 'odd type' }])
  })
})

describe('sameCompanions', () => {
  test('equal lists are the same; a different id, label or length is not', () => {
    const list = [{ id: 'a', type: 'Explore' }]
    expect(sameCompanions(list, [{ id: 'a', type: 'Explore' }])).toBe(true)
    expect(sameCompanions(list, [{ id: 'b', type: 'Explore' }])).toBe(false)
    expect(sameCompanions(list, [{ id: 'a', type: 'Plan' }])).toBe(false)
    expect(sameCompanions(list, [])).toBe(false)
  })
})
