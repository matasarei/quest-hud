// What the engine answers in these tests: nothing sits beneath the plugin, so
// these hooks stand for it. `world` holds what a test changes between events.
import { mock } from 'claude-code/testing'
import type { AgentInfo, CommandInfo, FsEntry, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

export const world: {
  id: string
  agents: AgentInfo[]
  blits: string[]
  /** Cell blits of the band's portrait, apart from the scene's. */
  bandBlits: string[]
  /** Blits that swap an Image (the probe, the animation's image frames), apart from the cell blits. */
  imageBlits: number
  /** When true, the engine answers an Image blit as where it drew the alt. */
  refuseImages: boolean
  opened: string[]
  /** How the engine answers a Bash call: its output, or the error text a failed command gives. */
  bash: { stdout?: string; stderr?: string; error?: string; interrupted?: boolean; backgroundTaskId?: string }
  /** The monsters as the plugin had stored them when each Bash call ran. */
  foesDuringBash: unknown[]
  panes: Array<{ id: string; isShown: boolean }>
  /** When true, the engine throws on opening a pane. */
  failOpen: boolean
  /** The panes the plugin closed. */
  closed: string[]
  /** Every status entry the plugin set, undefined when it cleared one. */
  statuses: Array<string | undefined>
  state: Record<string, unknown>
  /** What the plugin kept with `$.store.set`, this test, and the keys it may not. */
  store: Record<string, unknown>
  storeRefuses: string[]
  /** Files by path: what `$.fs.read` and `$.fs.exists` answer. */
  files: Record<string, string>
  /** Directories by path: what `$.fs.list` and `$.fs.exists` answer. */
  dirs: Record<string, FsEntry[]>
  /** Paths `$.fs.read` refuses for their size. */
  tooBig: string[]
  /** Every path `$.fs.read` was asked for. */
  reads: string[]
  settings: Record<string, unknown>
  commands: CommandInfo[]
  /** What grep prints; undefined when it cannot start. A held scan waits for `grepGate`. */
  grep: string | undefined
  grepGate?: Promise<void>
  /** How each spawn ends, in turn; past the list, as grep ends on its own. */
  grepEnds: Array<{ code: number | null; signal: string | null }>
  /** Every command spawned, and every one run. */
  spawned: string[][]
  ran: string[][]
} = {
  id: 's1',
  state: {},
  agents: [],
  blits: [],
  bandBlits: [],
  imageBlits: 0,
  refuseImages: false,
  opened: [],
  bash: {},
  foesDuringBash: [],
  panes: [],
  failOpen: false,
  closed: [],
  statuses: [],
  store: {},
  storeRefuses: [],
  files: {},
  dirs: {},
  tooBig: [],
  reads: [],
  settings: {},
  commands: [],
  grep: '',
  grepEnds: [],
  spawned: [],
  ran: [],
}

export const NOW = Date.parse('2026-11-01T10:00:00Z')

export const engine = (on: On, store: Readonly<Record<string, unknown>> = {}) => {
  world.id = 's1'
  world.agents = []
  world.blits = []
  world.bandBlits = []
  world.imageBlits = 0
  world.refuseImages = false
  world.opened = []
  world.bash = {}
  world.foesDuringBash = []
  world.panes = []
  world.failOpen = false
  world.closed = []
  world.statuses = []
  world.state = {}
  world.storeRefuses = []
  world.files = {}
  world.dirs = {}
  world.tooBig = []
  world.reads = []
  world.settings = {}
  world.commands = []
  world.grep = ''
  world.grepGate = undefined
  world.grepEnds = []
  world.spawned = []
  world.ran = []
  // Every value the plugin stores, as the kit's own store accepted it.
  on('state.set', async (_, e, next) => {
    const stored = await next(e)
    if (stored.value?.isSet) world.state[e.key] = e.value
    return stored
  })
  // The store: mock.store takes the same events and shows a test nothing of what was kept.
  world.store = JSON.parse(JSON.stringify(store)) as Record<string, unknown>
  on('store.get', (_, e) => ({ value: world.store[e.key] }))
  on('store.set', (_, e) => {
    if (world.storeRefuses.includes(e.key)) return { deny: 'the store is full' }
    world.store[e.key] = JSON.parse(JSON.stringify(e.value)) as unknown
    return { value: undefined }
  })
  on('store.delete', (_, e) => {
    delete world.store[e.key]
    return { value: undefined }
  })
  on('store.keys', () => ({ value: Object.keys(world.store) }))
  const clock = mock.clock(on, { now: NOW })
  mock.env(on, { HOME: '/home/a' })
  on('fs.read', (_, e) => {
    world.reads.push(e.path)
    if (world.tooBig.includes(e.path)) throw new Error('over 4 MiB')
    const text = world.files[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('fs.list', (_, e) => {
    const entries = world.dirs[e.path]
    if (entries === undefined) throw new Error('ENOENT')
    return { value: entries }
  })
  on('fs.exists', (_, e) => ({ value: e.path in world.files || e.path in world.dirs }))
  on('settings.read', () => ({ value: world.settings }))
  on('command.list', () => ({ value: world.commands }))
  on('process.run', (_, e) => {
    world.ran.push([...e.argv])
    return { value: { exitCode: 0, stdout: world.files[e.argv.at(-1) ?? ''] ?? '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('process.spawn', async function* (_, e) {
    world.spawned.push([...e.argv])
    await world.grepGate
    if (world.grep === undefined) throw new Error('grep: not found')
    if (world.grep !== '') yield { stream: 'stdout' as const, text: world.grep }
    return { value: world.grepEnds.shift() ?? { code: world.grep === '' ? 1 : 0, signal: null } }
  })
  on('command.register', () => ({ value: { command: 'quest-hud' } }))
  on('session.id', () => ({ value: world.id }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: [] } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('agent.list', () => ({ value: world.agents }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.status', (_, e) => {
    world.statuses.push(e.text)
    return { value: undefined }
  })
  // Below the plugin's hooks, what the engine does with a command nobody answered: the skill's text.
  on('command.run', () => ({ text: 'the skill ran' }))
  on('ui.close', (_, e) => {
    world.closed.push(e.id)
    world.panes = world.panes.filter(pane => pane.id !== e.id)
    return { value: undefined }
  })
  on('ui.open', (_, e) => {
    if (world.failOpen) throw new Error('no pane today')
    world.opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.panes', () => ({ value: world.panes.map(p => ({ ...p, title: 'The Road', isFocused: false, isPlaced: p.isShown })) }))
  on('ui.blit', (_, e) => {
    if ('source' in e) {
      world.imageBlits += 1
      return { value: world.refuseImages ? { deny: 'the Image draws its alt there' } : {} }
    }
    const cells = 'cells' in e && typeof e.cells === 'string' ? e.cells : ''
    if (e.key === 'avatar') world.bandBlits.push(cells)
    else world.blits.push(cells)
    return { value: {} }
  })
  on('tool.call', (_, e) => {
    if (e.tool === 'Bash') {
      world.foesDuringBash.push(world.state.foes)
      const { stdout = '', stderr = '', error, interrupted = false, backgroundTaskId } = world.bash
      if (error !== undefined) return { isError: true, result: error, text: error }
      return { result: { stdout, stderr, interrupted, ...(backgroundTaskId === undefined ? {} : { backgroundTaskId }) } }
    }
    if (e.tool === 'TaskCreate') return { result: { task: { id: `t-${e.subject}`, subject: e.subject } } }
    if (e.tool === 'Edit') {
      return {
        result: {
          filePath: e.file_path,
          structuredPatch: [{ oldStart: 1, oldLines: 7, newStart: 1, newLines: 4, lines: ['+a', '+b', '+c', '+d', '-1', '-2', '-3', '-4', '-5', '-6', '-7'] }],
        },
      }
    }
    return { result: {} }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.component === 'PromptHint' ? `tail: ${e.props.tail ?? 'none'}` : 'engine below'}</Text>
  })
  return clock
}

export const start = ($: Engine) => $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

/** The last value the plugin stored under a key of its own; undefined if it never wrote one. */
export const stateOf = async (_: Engine, key: string): Promise<unknown> => world.state[key]

export const agent = (id: string, type: string, status: AgentInfo['status']): AgentInfo => ({ id, type, status, description: '' })

// What command.run carries beside the command: where it came from, and the screen.
export const RUN = { origin: { kind: 'sdk' }, presentation: { isFullscreen: false, columns: 120 } } as const
