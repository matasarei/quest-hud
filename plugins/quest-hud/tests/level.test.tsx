import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { FsEntry } from 'claude-code'

import { engine, RUN, start, stateOf, world } from './kit'
import type { LevelCard, LogEntry } from '../types'

const CONFIG = '/home/a/.claude'
const PROJECTS = `${CONFIG}/projects`
const REPO = '/home/a/repo'
const DIR = `${PROJECTS}/-home-a-repo`

const run = async ($: Engine, command: string, args = ''): Promise<string> =>
  (await $.command.run({ command, args, ...RUN })).text ?? ''

const file = (name: string, size = 10, mtimeMs = 1000): FsEntry => ({ name, kind: 'file', size, mtimeMs, isLink: false })
const dir = (name: string): FsEntry => ({ name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })

const grepLine = (session: string, id: string, name: string, input = ''): string =>
  `${DIR}/${session}.jsonl:"type":"tool_use","id":"${id}","name":"${name}"${input}\n`

const prompt = (display: string, project = REPO, sessionId = 's1'): string => JSON.stringify({ display, project, sessionId })

/** A machine: one project with five prompts and a CLAUDE.md, two sessions, one note, gku installed. */
const machine = (): void => {
  world.files = {
    [`${CONFIG}/history.jsonl`]: Array.from({ length: 5 }, () => prompt('/gku:plan')).join('\n'),
    [`${REPO}/CLAUDE.md`]: '# the project',
  }
  world.dirs = {
    [REPO]: [],
    [PROJECTS]: [dir('-home-a-repo')],
    [DIR]: [file('s1.jsonl'), file('s2.jsonl'), dir('memory')],
    [`${DIR}/memory`]: [file('MEMORY.md'), file('a-note.md')],
  }
  world.commands = [
    { name: 'clear', description: '', source: 'builtin' },
    { name: 'gku:plan', description: '', source: 'plugin', plugin: 'gku' },
    { name: 'quest-hud:level', description: '', source: 'plugin', plugin: 'quest-hud' },
  ]
  world.settings = { enabledPlugins: { 'gku@grinchenkoedu': true, 'quest-hud@quest-hud': true } }
  world.grep = grepLine('s1', 'a', 'Bash', ',"input":{"command":"npx vitest run') + grepLine('s2', 'b', 'Edit', ',"input":{"file_path":"/r/x.php')
}

/** Lets a scan left running in the background finish: each call goes through the host. */
const settled = async ($: Engine): Promise<void> => {
  for (let i = 0; i < 200; i++) await run($, 'quest-hud:help')
}

const stored = async (_: Engine): Promise<LevelCard | undefined> => world.store.level as LevelCard | undefined

const logged = (): LogEntry[] => (world.state.log ?? []) as LogEntry[]

describe('when the transcripts are read', () => {
  test('never at a session start: it loads the card and spawns nothing', async ($, on) => {
    engine(on)
    machine()
    await start($)
    expect(world.spawned).toEqual([])
    expect(world.reads).toEqual([])
  })

  test('the first /quest-hud:level answers at once and sends the scout', async ($, on) => {
    engine(on)
    machine()
    await start($)
    const text = await run($, 'quest-hud:level')
    expect(text).toContain('The scout rides out: 2 sessions')
    await settled($)
    expect(world.spawned).toHaveLength(1)
    expect(world.spawned[0]?.slice(0, 2)).toEqual(['grep', '-HoE'])
    expect(world.spawned[0]?.slice(-3)).toEqual(['--', `${DIR}/s1.jsonl`, `${DIR}/s2.jsonl`])
  })

  test('the card reaches the store, the atom and the log once it is back', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    const card = await stored($)
    expect(card?.usage.sessions).toBe(2)
    expect(card?.usage.testRuns).toBe(1)
    expect(card?.usage.edits).toEqual({ php: 1 })
    expect(card?.usage.skillRuns).toEqual({ 'gku:plan': 5 })
    expect(world.state.level).toEqual(card)
    expect(logged().at(-1)?.kind).toBe('level')
    expect(logged().at(-1)?.text).toBe(`Lv ${card?.level} ${card?.title}`)
  })

  test('the next run answers with the parts, and spawns nothing when no file changed', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    world.spawned = []
    const text = await run($, 'quest-hud:level')
    expect(text).toContain('⚔ Level ')
    expect(text).toContain('Checks')
    expect(text).not.toContain('Rereading')
    expect(world.spawned).toEqual([])
  })

  test('a run after a change reads only the changed file', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    world.spawned = []
    world.dirs[DIR] = [file('s1.jsonl'), file('s2.jsonl', 99, 2000), file('s3.jsonl'), dir('memory')]
    world.grep = grepLine('s2', 'b', 'Edit', ',"input":{"file_path":"/r/x.php') + grepLine('s3', 'c', 'Read')
    const text = await run($, 'quest-hud:level')
    expect(text).toContain('Rereading 2 changed sessions')
    await settled($)
    expect(world.spawned[0]?.slice(-3)).toEqual(['--', `${DIR}/s2.jsonl`, `${DIR}/s3.jsonl`])
    expect((await stored($))?.usage.sessions).toBe(3)
  })

  test('a session that is gone leaves the count', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    world.dirs[DIR] = [file('s1.jsonl'), dir('memory')]
    await run($, 'quest-hud:level')
    await settled($)
    expect((await stored($))?.usage.sessions).toBe(1)
  })

  test('a long machine is read in batches', async ($, on) => {
    engine(on)
    machine()
    world.dirs[DIR] = Array.from({ length: 250 }, (_, i) => file(`f${i}.jsonl`))
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect(world.spawned).toHaveLength(3)
    expect(world.spawned[0]?.filter(arg => arg.endsWith('.jsonl'))).toHaveLength(100)
    expect(world.spawned[2]?.filter(arg => arg.endsWith('.jsonl'))).toHaveLength(50)
  })

  test('one scan at a time: a second call says so and starts nothing', async ($, on) => {
    engine(on)
    machine()
    let release = (): void => {}
    world.grepGate = new Promise<void>(resolve => {
      release = resolve
    })
    await start($)
    await run($, 'quest-hud:level')
    expect(await run($, 'quest-hud:level')).toContain('Still reading')
    await settled($)
    expect(world.spawned).toHaveLength(1)
    release()
    await settled($)
    world.spawned = []
    world.dirs[DIR] = [file('s1.jsonl', 99)]
    await run($, 'quest-hud:level')
    await settled($)
    expect(world.spawned).toHaveLength(1)
  })
})

describe('when the transcripts cannot be read', () => {
  test('a grep that cannot start gives a card saying so, with no error', async ($, on) => {
    engine(on)
    machine()
    world.grep = undefined
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    const card = await stored($)
    expect(card?.usage.isRead).toBe(false)
    expect(await run($, 'quest-hud:level')).toContain('usage unread')
  })

  test('zero matches keeps the tallies there were, and reads no fall', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    const before = await stored($)
    world.dirs[DIR] = [file('s1.jsonl', 99, 2000), file('s2.jsonl', 99, 2000), dir('memory')]
    world.grep = ''
    await run($, 'quest-hud:level')
    await settled($)
    expect((await stored($))?.level).toBe(before?.level)
    expect((await stored($))?.usage.isRead).toBe(true)
  })

  test('no sessions directory: still a card, from what is set up', async ($, on) => {
    engine(on)
    machine()
    delete world.dirs[PROJECTS]
    await start($)
    expect(await run($, 'quest-hud:level')).toContain('usage unread')
    expect(world.spawned).toEqual([])
  })

  test('a refused store write keeps the level on screen and says it will read again', async ($, on) => {
    engine(on)
    machine()
    world.storeRefuses = ['survey']
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect((world.state.level as LevelCard | undefined)?.usage.sessions).toBe(2)
    expect(logged().at(-1)?.text).toContain('read again')
  })
})

describe('a grep that does not finish', () => {
  const readFiles = (): string[] => (world.spawned[0] ?? []).filter(arg => arg.endsWith('.jsonl'))

  test('killed partway, its files are not taken as read: the next run reads them again', async ($, on) => {
    engine(on)
    machine()
    world.grep = grepLine('s1', 'a', 'Read')
    world.grepEnds = [{ code: null, signal: 'SIGKILL' }]
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect(Object.keys((world.store.survey ?? {}) as object)).toEqual([])
    world.spawned = []
    world.grep = grepLine('s1', 'a', 'Read') + grepLine('s2', 'b', 'Read')
    await run($, 'quest-hud:level')
    await settled($)
    expect(readFiles()).toEqual([`${DIR}/s1.jsonl`, `${DIR}/s2.jsonl`])
    expect((await stored($))?.usage.sessions).toBe(2)
  })

  test('killed in one batch, the batches before it still count', async ($, on) => {
    engine(on)
    machine()
    world.dirs[DIR] = Array.from({ length: 150 }, (_, i) => file(`f${i}.jsonl`))
    world.grep = grepLine('f0', 'a', 'Read')
    world.grepEnds = [{ code: 0, signal: null }, { code: null, signal: 'SIGTERM' }]
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect(Object.keys((world.store.survey ?? {}) as object)).toHaveLength(100)
  })

  test('the log says so, even with the level unchanged', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    const before = await stored($)
    world.dirs[DIR] = [file('s1.jsonl', 99, 2000), file('s2.jsonl', 99, 2000), dir('memory')]
    world.grepEnds = [{ code: null, signal: 'SIGKILL' }]
    await run($, 'quest-hud:level')
    await settled($)
    expect((await stored($))?.level).toBe(before?.level)
    expect(logged().at(-1)?.text).toBe(`Lv ${before?.level} ${before?.title} · 2 sessions not read, read again next time`)
  })

  test('a grep that cannot start says so too', async ($, on) => {
    engine(on)
    machine()
    world.grep = undefined
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect(logged().at(-1)?.text).toContain('2 sessions not read')
  })

  test('one that stops starting keeps the batches it read, and says how many it did not', async ($, on) => {
    engine(on)
    machine()
    world.dirs[DIR] = Array.from({ length: 150 }, (_, i) => file(`f${i}.jsonl`))
    world.grep = grepLine('f0', 'a', 'Read')
    world.grepFailsAt = 1
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect(Object.keys((world.store.survey ?? {}) as object)).toHaveLength(100)
    expect(logged().at(-1)?.text).toContain('50 sessions not read')
  })

  test('a whole read says nothing of the kind', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect(logged().at(-1)?.text).not.toContain('not read')
  })

  test('exit 2 is a file swept meanwhile: the rest is read, and not read again', async ($, on) => {
    engine(on)
    machine()
    world.grepEnds = [{ code: 2, signal: null }]
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    world.spawned = []
    await run($, 'quest-hud:level')
    await settled($)
    expect(world.spawned).toEqual([])
  })
})

describe('what the level reads of the machine', () => {
  test('a project needs five prompts, and to exist, and not to be a scratch run', async ($, on) => {
    engine(on)
    machine()
    world.files[`${CONFIG}/history.jsonl`] = [
      ...Array.from({ length: 5 }, () => prompt('hello', REPO)),
      ...Array.from({ length: 4 }, () => prompt('hello', '/home/a/few')),
      ...Array.from({ length: 9 }, () => prompt('hello', '/private/tmp/x')),
      ...Array.from({ length: 9 }, () => prompt('hello', '/home/a/gone')),
    ].join('\n')
    world.dirs['/home/a/few'] = []
    world.dirs['/private/tmp/x'] = []
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect((await stored($))?.parts.find(part => part.name === 'Instructions')?.note).toBe('1 of 1 projects')
  })

  test('notes are counted without their index, across the projects', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect((await stored($))?.parts.find(part => part.name === 'Memory')?.note).toBe('1 note in 1 project')
  })

  test('a project\'s own settings count, and a broken file does no harm', async ($, on) => {
    engine(on)
    machine()
    world.files[`${REPO}/.claude/settings.json`] = '{"hooks":{"PostToolUse":[]},"permissions":{"deny":["Read(.env)"]}}'
    world.files[`${REPO}/.claude/settings.local.json`] = '{ not json'
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect((await stored($))?.parts.find(part => part.name === 'Guardrails')?.score).toBe(3)
  })

  test('agents of your own count, global and per project', async ($, on) => {
    engine(on)
    machine()
    world.dirs[`${CONFIG}/agents`] = [file('a.md')]
    world.dirs[`${REPO}/.claude/agents`] = [file('b.md'), file('not-an-agent.txt')]
    world.grep = Array.from({ length: 2 }, (_, i) => grepLine(`s${i + 1}`, `x${i}`, 'Agent')).join('')
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect((await stored($))?.parts.find(part => part.name === 'Delegation')?.score).toBe(3)
  })

  test('a history over the read limit is read from its tail', async ($, on) => {
    engine(on)
    machine()
    world.tooBig = [`${CONFIG}/history.jsonl`]
    await start($)
    await run($, 'quest-hud:level')
    expect(world.ran).toEqual([['tail', '-c', '4000000', `${CONFIG}/history.jsonl`]])
    await settled($)
    expect((await stored($))?.parts.find(part => part.name === 'Instructions')?.note).toBe('1 of 1 projects')
  })

  test('no history: still a card', async ($, on) => {
    engine(on)
    machine()
    delete world.files[`${CONFIG}/history.jsonl`]
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect((await stored($))?.parts.find(part => part.name === 'Instructions')?.note).toBe('no project worked in yet')
  })

  test('nothing but counts and names reaches the store, the state or the answers', async ($, on) => {
    engine(on)
    machine()
    const SECRET = 'MARKER'
    world.files[`${CONFIG}/history.jsonl`] = Array.from({ length: 5 }, () => prompt(`/gku:plan the ${SECRET}PROMPT`, `/home/a/${SECRET}project`)).join('\n')
    world.dirs[`/home/a/${SECRET}project`] = []
    world.files[`/home/a/${SECRET}project/CLAUDE.md`] = `${SECRET}INSTRUCTION`
    world.dirs[PROJECTS] = [dir(`-home-a-${SECRET}project`)]
    world.dirs[`${PROJECTS}/-home-a-${SECRET}project`] = [file('s1.jsonl')]
    world.settings = { env: { TOKEN: `${SECRET}TOKEN` } }
    world.grep = `${PROJECTS}/-home-a-${SECRET}project/s1.jsonl:"type":"tool_use","id":"a","name":"Bash","input":{"command":"${SECRET}=1 gh pr view ${SECRET}ARG\n`
      + `${PROJECTS}/-home-a-${SECRET}project/s1.jsonl:"type":"tool_use","id":"b","name":"Edit","input":{"file_path":"/${SECRET}path/x.php\n`
    await start($)
    const first = await run($, 'quest-hud:level')
    await settled($)
    const second = await run($, 'quest-hud:level')
    const third = await run($, 'quest-hud:level-up')
    expect((await stored($))?.usage.ghRuns).toBe(1)
    for (const text of [first, second, third, JSON.stringify(world.store), JSON.stringify(world.state)]) {
      expect(text).not.toContain(SECRET)
    }
  })
})

describe('/quest-hud:level-up', () => {
  test('with no level yet, it says what to run', async ($, on) => {
    engine(on)
    machine()
    await start($)
    expect(await run($, 'quest-hud:level-up')).toContain('/quest-hud:level')
    expect(world.spawned).toEqual([])
  })

  test('answers from the card and a fresh look at the setup: no process, no transcript', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    world.spawned = []
    world.reads = []
    const text = await run($, 'quest-hud:level-up')
    expect(text).toContain('Quests for level')
    expect(text).toContain("The Guild's Next Skill")
    expect(world.spawned).toEqual([])
    expect(world.reads.filter(path => path.endsWith('.jsonl') && !path.endsWith('history.jsonl'))).toEqual([])
  })

  test('a quest done since goes away, and the level moves', async ($, on) => {
    engine(on)
    machine()
    world.grep = Array.from({ length: 10 }, (_, i) => grepLine('s1', `e${i}`, 'Edit', ',"input":{"file_path":"/r/x.php')).join('')
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    expect(await run($, 'quest-hud:level-up')).toContain('The Silent Scribe')
    const before = await stored($)
    world.settings = { enabledPlugins: { 'gku@grinchenkoedu': true, 'php-lsp@claude-plugins-official': true } }
    expect(await run($, 'quest-hud:level-up')).not.toContain('The Silent Scribe')
    expect((await stored($))?.points).toBeGreaterThan(before?.points ?? 0)
    expect((world.state.level as LevelCard | undefined)?.points).toBeGreaterThan(before?.points ?? 0)
  })
})

describe('the plain /quest-hud', () => {
  test('takes both words', async ($, on) => {
    engine(on)
    machine()
    await start($)
    expect(await run($, 'quest-hud', 'level')).toContain('The scout rides out')
    await settled($)
    expect(await run($, 'quest-hud', 'level-up')).toContain('Quests for level')
  })
})

describe('a card kept from before', () => {
  test('a session start loads it, with nothing read', async ($, on) => {
    engine(on)
    machine()
    await start($)
    await run($, 'quest-hud:level')
    await settled($)
    const card = await stored($)
    world.reads = []
    world.spawned = []
    world.id = 's2'
    await start($)
    expect(await stateOf($, 'level')).toEqual(card)
    expect(world.reads).toEqual([])
    expect(world.spawned).toEqual([])
  })

  // Left by an older mod: no version in plugin.json means every commit is an update.
  test('a card of another shape asks for a new reading, and does not fail', async ($, on) => {
    engine(on, { level: { level: 3, title: 'Initiate', points: 5, outOf: 21, parts: [], usage: { isRead: true } } })
    machine()
    await start($)
    expect(await run($, 'quest-hud:level-up')).toContain('No level yet')
  })

  test('what is no card loads as none', async ($, on) => {
    engine(on, { level: 'level 8' })
    await start($)
    expect(await stateOf($, 'level')).toBeNull()
  })
})
