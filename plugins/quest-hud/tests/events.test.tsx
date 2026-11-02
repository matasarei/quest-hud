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

  test('a compaction refills the mana at once, before the next response measures it', async ($, on) => {
    engine(on)
    on('session.compact', () => ({ messages: [{ role: 'assistant', text: 'summary', toolUses: [] }], tokensBefore: 180_000, tokensAfter: 38_000 }))
    await start($)
    await $.session.measure({ context: { window: 200_000, tokens: 180_000, percent: 90 }, rateLimits: [], changed: ['context'] })
    await $.session.compact({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }] })
    expect(await stateOf($, 'meters')).toEqual({ window: 200_000, contextTokens: 38_000, contextPercent: 19 })
  })

  test("a subagent's compaction, or one only precomputed, leaves the mana as measured", async ($, on) => {
    engine(on)
    on('session.compact', () => ({ messages: [{ role: 'assistant', text: 'summary', toolUses: [] }], tokensBefore: 180_000, tokensAfter: 38_000 }))
    await start($)
    await $.session.measure({ context: { window: 200_000, tokens: 180_000, percent: 90 }, rateLimits: [], changed: ['context'] })
    await $.session.compact({ trigger: 'auto', agentId: 'a1', messages: [{ role: 'user', text: 'hi', toolUses: [] }] })
    await $.session.compact({ trigger: 'precompute', messages: [{ role: 'user', text: 'hi', toolUses: [] }] })
    expect(await stateOf($, 'meters')).toEqual({ window: 200_000, contextTokens: 180_000, contextPercent: 90 })
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

describe('fights, from Bash calls', () => {
  const foes = ($: Parameters<typeof start>[0]) => stateOf($, 'foes')

  test('a failed test run leaves the dragon standing; a passing one clears it', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { error: 'Exit code 1\n 231 pass\n 1 fail' }
    await $.tool.call({ tool: 'Bash', command: 'cd /repo && claude plugin test plugins/quest-hud', description: '' })
    expect(await foes($)).toEqual({ test: 'standing', lint: 'none' })
    world.bash = { stdout: ' 232 pass\n 0 fail\n' }
    await $.tool.call({ tool: 'Bash', command: 'claude plugin test plugins/quest-hud', description: '' })
    expect(await foes($)).toEqual({ test: 'none', lint: 'none' })
    expect(await texts($)).toEqual(['tests lost · 231 pass · 1 fail', 'tests won · 232 pass · 0 fail'])
  })

  test('the monster is up while the run is', async ($, on) => {
    engine(on)
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'npx eslint src', description: '' })
    expect(world.foesDuringBash).toEqual([{ test: 'none', lint: 'fighting' }])
    expect(await foes($)).toEqual({ test: 'none', lint: 'none' })
  })

  test('interrupted and background runs log nothing and change nothing', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { error: 'Exit code 1' }
    await $.tool.call({ tool: 'Bash', command: 'pytest', description: '' })
    world.bash = { interrupted: true }
    await $.tool.call({ tool: 'Bash', command: 'pytest', description: '' })
    world.bash = { backgroundTaskId: 'b1' }
    await $.tool.call({ tool: 'Bash', command: 'pytest', description: '' })
    await $.tool.call({ tool: 'Bash', command: 'pytest', description: '', run_in_background: true })
    expect(await foes($)).toEqual({ test: 'standing', lint: 'none' })
    expect(await texts($)).toEqual(['tests lost'])
  })

  test('a subagent\'s test run is a fight, led by its type; its reads stay out of the log', async ($, on) => {
    engine(on)
    await start($)
    world.agents = [agent('a1', 'gku:runner', 'running')]
    await $.turn.start({ text: 'run the suite', turnId: 'turn-1', agentId: 'a1' })
    world.bash = { stdout: 'Tests:       30 passed, 30 total' }
    await $.tool.call({ tool: 'Bash', command: 'npm test', description: '', agentId: 'a1' })
    await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts', agentId: 'a1' })
    expect((await texts($)).filter(text => !text.endsWith('joined'))).toEqual(['gku:runner · tests won · 30 pass · 0 fail'])
  })

  test('other commands are not fights, and the hook returns what the call resolved to', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { stdout: 'hello' }
    const ran = await $.tool.call({ tool: 'Bash', command: 'echo "npm test"', description: '' })
    expect(ran.result).toEqual({ stdout: 'hello', stderr: '', interrupted: false })
    expect(await foes($)).toEqual({ test: 'none', lint: 'none' })
    expect(world.foesDuringBash).toEqual([{ test: 'none', lint: 'none' }])
    expect(await texts($)).toEqual([])
  })

  test('a new session sends the monsters away', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { error: 'Exit code 2' }
    await $.tool.call({ tool: 'Bash', command: 'npm run lint', description: '' })
    expect(await foes($)).toEqual({ test: 'none', lint: 'standing' })
    world.id = 's2'
    await start($)
    expect(await foes($)).toEqual({ test: 'none', lint: 'none' })
  })
})

describe('loot, from commits', () => {
  test('a commit drops loot and logs its sha and subject; a quiet one logs "a commit"', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { stdout: '[main 2af33ea] Fix the probe\n 1 file changed' }
    await $.tool.call({ tool: 'Bash', command: 'git add a.ts && git commit -m "Fix the probe"', description: '' })
    world.bash = { stdout: '' }
    await $.tool.call({ tool: 'Bash', command: "git commit -q -F - <<'EOF'\nRetitle\nEOF", description: '' })
    expect(await stateOf($, 'loot')).toBe(2)
    expect(await texts($)).toEqual(['2af33ea Fix the probe', 'a commit'])
  })

  test('a refused commit, a dry run and a subagent\'s commit drop nothing', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { error: 'Exit code 1\nhook refused' }
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x', description: '' })
    world.bash = { stdout: '' }
    await $.tool.call({ tool: 'Bash', command: 'git commit --dry-run', description: '' })
    world.bash = { stdout: '[main 1234567] Theirs' }
    await $.tool.call({ tool: 'Bash', command: 'git commit -m Theirs', description: '', agentId: 'a1' })
    expect(await stateOf($, 'loot')).toBe(0)
    expect(await texts($)).toEqual([])
  })

  test('a new session starts with no loot', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { stdout: '[main 2af33ea] x' }
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x', description: '' })
    world.id = 's2'
    await start($)
    expect(await stateOf($, 'loot')).toBe(0)
  })
})

describe('the octopus and the fox, from gh and glab', () => {
  const allies = ($: Parameters<typeof start>[0]) => stateOf($, 'allies')

  test('gh brings the octopus; a PR opened and merged is logged, a view is not', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { stdout: '[{"number":3}]' }
    await $.tool.call({ tool: 'Bash', command: 'gh pr view --json number', description: '' })
    expect(await allies($)).toEqual({ octopus: true, fox: false })
    world.bash = { stdout: 'https://github.com/o/r/pull/3\n' }
    await $.tool.call({ tool: 'Bash', command: 'gh pr create --title x --body-file b.md', description: '' })
    world.bash = { stdout: '' }
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge 3 --merge', description: '' })
    expect(await texts($)).toEqual(['PR #3 opened', 'PR #3 merged'])
  })

  test('failed checks are logged though the call errored', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { error: 'Exit code 8\nsome checks failed' }
    await $.tool.call({ tool: 'Bash', command: 'gh pr checks 3', description: '' })
    expect(await texts($)).toEqual(['PR #3 checks failed'])
  })

  test('glab brings the fox', async ($, on) => {
    engine(on)
    await start($)
    world.bash = { stdout: 'https://gitlab.com/o/r/-/merge_requests/12\n' }
    await $.tool.call({ tool: 'Bash', command: 'glab mr create --fill', description: '' })
    expect(await allies($)).toEqual({ octopus: false, fox: true })
    expect(await texts($)).toEqual(['MR !12 opened'])
  })

  test('a subagent\'s gh call brings no one, and a new session sends them home', async ($, on) => {
    engine(on)
    await start($)
    await $.tool.call({ tool: 'Bash', command: 'gh pr list', description: '', agentId: 'a1' })
    expect(await allies($)).toEqual({ octopus: false, fox: false })
    await $.tool.call({ tool: 'Bash', command: 'gh pr list && glab mr list', description: '' })
    expect(await allies($)).toEqual({ octopus: true, fox: true })
    world.id = 's2'
    await start($)
    expect(await allies($)).toEqual({ octopus: false, fox: false })
  })
})
