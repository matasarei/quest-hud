import { describe, expect, test } from 'claude-code/testing'

import type { Companion, LogEntry } from '../types'
import { agent, engine, start, stateOf, world } from './kit'

const texts = async ($: Parameters<typeof start>[0]) => ((await stateOf($, 'log')) as LogEntry[]).map(entry => entry.text)

describe('the log, from tool calls', () => {
  test('reads and searches of one main turn make one line, and the Wilds turn into the map room', async ($, on) => {
    engine(on)
    await start($)
    await $.turn.start({ text: 'look around', turnId: 'turn-1' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
    await $.tool.call({ tool: 'WebSearch', query: 'csv quoting', mode: 'standard' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/b.ts' })
    expect(await texts($)).toEqual(['read 2 files · 1 search'])
    expect(await stateOf($, 'activity')).toBe('map')
  })

  test('an edit is a cast line with its counts, and the Wilds turn into the forge', async ($, on) => {
    engine(on)
    await start($)
    await $.tool.call({ tool: 'Edit', file_path: '/repo/src/export/csv.ts', old_string: 'a', new_string: 'b' })
    expect(await texts($)).toEqual(['csv.ts +4 -7'])
    expect(await stateOf($, 'activity')).toBe('forge')
  })

  test('a task completed is a line; the same update again is not', async ($, on) => {
    engine(on)
    await start($)
    await $.tool.call({ tool: 'TaskCreate', subject: 'Read the exporter', description: '' })
    await $.tool.call({ tool: 'TaskUpdate', taskId: 't-Read the exporter', status: 'completed' })
    await $.tool.call({ tool: 'TaskUpdate', taskId: 't-Read the exporter', status: 'completed' })
    expect(await texts($)).toEqual(['✓ Read the exporter'])
  })

  test('plan mode is a line', async ($, on) => {
    engine(on)
    await start($)
    await $.tool.call({ tool: 'EnterPlanMode' })
    expect(await texts($)).toEqual(['entered'])
  })

  test('a subagent\'s own calls stay out of the log and the task list', async ($, on) => {
    engine(on)
    await start($)
    await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts', agentId: 'a1' })
    await $.tool.call({ tool: 'Edit', file_path: '/repo/a.ts', old_string: 'a', new_string: 'b', agentId: 'a1' })
    expect(await texts($)).toEqual([])
    expect(await stateOf($, 'activity')).toBe(null)
  })
})

describe('skills in the log', () => {
  test('a skill run is a line with its zone', async ($, on) => {
    engine(on)
    await start($)
    await $.skill.prompt({ skill: 'plan', pluginName: 'gku', text: 'x', frontmatter: { description: 'Turn a request into a plan' } })
    expect(await texts($)).toEqual(['gku:plan · Map room'])
  })
})

describe('working, and companions', () => {
  test('a main turn sets isWorking until it completes', async ($, on) => {
    engine(on)
    await start($)
    await $.turn.start({ text: 'go', turnId: 'turn-1' })
    expect(await stateOf($, 'isWorking')).toBe(true)
    await $.turn.complete({ turnId: 'turn-1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
    expect(await stateOf($, 'isWorking')).toBe(false)
  })

  test('a subagent joins when its turn starts and leaves once it is done', async ($, on) => {
    engine(on)
    await start($)
    world.agents = [agent('a1', 'Explore', 'running')]
    await $.turn.start({ text: 'explore', turnId: 'sub-1', agentId: 'a1' })
    expect(await stateOf($, 'companions') as Companion[]).toEqual([{ id: 'a1', type: 'Explore' }])
    expect(await stateOf($, 'isWorking')).toBe(false)
    world.agents = [agent('a1', 'Explore', 'completed')]
    await $.turn.complete({ turnId: 'sub-1', agentId: 'a1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
    expect(await stateOf($, 'companions') as Companion[]).toEqual([])
    expect(await texts($)).toEqual(['Explore joined', 'Explore left'])
  })
})

describe('camp', () => {
  test('a compaction is a line with the tokens before and after', async ($, on) => {
    engine(on)
    on('session.compact', () => ({ messages: [{ role: 'assistant', text: 'summary', toolUses: [] }], tokensBefore: 164_000, tokensAfter: 38_000 }))
    await start($)
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] })
    expect(await texts($)).toEqual(['164k → 38k'])
  })

  test('a skipped compaction is no line', async ($, on) => {
    engine(on)
    on('session.compact', () => ({ skip: 'nothing to compact' }))
    await start($)
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] })
    expect(await texts($)).toEqual([])
  })
})

describe('a new session id', () => {
  test('clears the log, the companions and the backdrop', async ($, on) => {
    engine(on)
    await start($)
    world.agents = [agent('a1', 'Explore', 'running')]
    await $.turn.start({ text: 'explore', turnId: 'sub-1', agentId: 'a1' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
    world.id = 's2'
    await start($)
    expect(await texts($)).toEqual([])
    expect(await stateOf($, 'companions')).toEqual([])
    expect(await stateOf($, 'activity')).toBe(null)
  })
})
