// What the harness survey reads: lines of grep over the session transcripts, and
// the prompt history. Pure. It keeps names and counts only: a command goes to
// commandKinds() and is dropped, a path gives its extension, a prompt its first
// /word. Nothing here is stored or drawn as it was written.
import type { Usage } from '../types'
import { commandKinds, type BashKind } from './bash'

/**
 * A tool call as a transcript spells it, cut inside its input: the first of a
 * command, a skill or a file path, and none of the prompts, outputs or file
 * contents around it. Edit's first key is either `replace_all` or `file_path`.
 */
export const SURVEY_PATTERN = '"type":"tool_use","id":"[^"]{1,80}","name":"[A-Za-z0-9_:.-]{1,120}"(,"input":\\{("replace_all":(true|false),)?"(command|skill|file_path)":"[^"]{0,240})?'

const SURVEY_LINE = /^(.*?):"type":"tool_use","id":"([^"]+)","name":"([^"]+)"(?:,"input":\{(?:"replace_all":(?:true|false),)?"(command|skill|file_path)":"([^"]*))?/

/** What one session came to. */
export type Tally = {
  /** Calls per tool, an MCP tool's apart. */
  calls: Record<string, number>
  /** Calls per MCP server. */
  mcp: Record<string, number>
  skills: Record<string, number>
  /** Edits and writes per extension. */
  extensions: Record<string, number>
  kinds: Partial<Record<BashKind, number>>
}

/** A session as read, and the file's size and time then: unchanged, it is not read again. */
export type Surveyed = { size: number; mtimeMs: number; tally: Tally }

/** A transcript on disk; `name` is its session, the file's name without `.jsonl`. */
export type Transcript = { name: string; path: string; size: number; mtimeMs: number }

const emptyTally = (): Tally => ({ calls: {}, mcp: {}, skills: {}, extensions: {}, kinds: {} })

const bump = (counts: Record<string, number>, key: string, by = 1): void => {
  counts[key] = (counts[key] ?? 0) + by
}

/** Only what looks like a skill's name is kept: a name, never text. */
const SKILL_NAME = /^[\w:.-]{1,80}$/

const sessionOf = (path: string): string => (path.split(/[\\/]/).pop() ?? path).replace(/\.jsonl$/, '')

const extensionOf = (path: string): string | undefined =>
  /\.([A-Za-z0-9]{1,8})$/.exec(path.split(/[\\/]/).pop() ?? '')?.[1]?.toLowerCase()

/** A command's text as grep cut it: JSON's escapes undone, and the backslash of a quote it stopped at gone. */
const unescaped = (raw: string): string =>
  raw.replace(/\\$/, '').replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))

const absorb = (tally: Tally, tool: string, key: string | undefined, value: string): void => {
  const server = /^mcp__(.+?)__/.exec(tool)?.[1]

  if (server !== undefined) {
    bump(tally.mcp, server)
    return
  }

  bump(tally.calls, tool)

  if (tool === 'Bash' && key === 'command') {
    for (const kind of commandKinds(unescaped(value))) tally.kinds[kind] = (tally.kinds[kind] ?? 0) + 1
  }

  if (tool === 'Skill' && key === 'skill' && SKILL_NAME.test(value)) bump(tally.skills, value)

  if ((tool === 'Edit' || tool === 'Write') && key === 'file_path') {
    const extension = extensionOf(value)
    if (extension !== undefined) bump(tally.extensions, extension)
  }
}

/**
 * Reads grep's output as it comes, in pieces that are not lines. A call seen
 * again in one file counts once: a transcript's request lines repeat them.
 */
export const surveyReader = () => {
  const tallies: Record<string, Tally> = {}
  const seen = new Map<string, Set<string>>()
  let rest = ''

  const take = (line: string): void => {
    const match = SURVEY_LINE.exec(line)
    if (!match) return

    const [, path = '', id = '', tool = '', key, value = ''] = match
    const session = sessionOf(path)
    const ids = seen.get(session) ?? new Set<string>()
    seen.set(session, ids)
    if (ids.has(id)) return

    ids.add(id)
    absorb((tallies[session] ??= emptyTally()), tool, key, value)
  }

  return {
    feed(text: string): void {
      const lines = (rest + text).split('\n')
      rest = lines.pop() ?? ''
      lines.forEach(take)
    },
    end(): Record<string, Tally> {
      take(rest)
      rest = ''
      return tallies
    },
  }
}

/** The prompt history, as far as the level needs it; held only while it is worked out. */
export type History = {
  /** Prompts per project path. */
  projects: Record<string, number>
  /** The first /word of each prompt that starts with one, counted per session. */
  typed: Record<string, Record<string, number>>
  sessions: string[]
}

/** Reads history.jsonl's lines; a broken line, as a tail's cut first one is, is passed over. */
export const parseHistory = (text: string): History => {
  const projects: Record<string, number> = {}
  const typed: Record<string, Record<string, number>> = {}
  const sessions = new Set<string>()

  for (const line of text.split('\n')) {
    let entry: { display?: unknown; project?: unknown; sessionId?: unknown }

    try {
      entry = JSON.parse(line) as typeof entry
    } catch {
      continue
    }

    if (typeof entry !== 'object' || entry === null) continue
    if (typeof entry.project === 'string') bump(projects, entry.project)
    if (typeof entry.sessionId !== 'string') continue

    sessions.add(entry.sessionId)

    const word = typeof entry.display === 'string' ? /^\/([\w:.-]{1,80})/.exec(entry.display)?.[1] : undefined
    if (word !== undefined) bump((typed[entry.sessionId] ??= {}), word)
  }

  return { projects, typed, sessions: [...sessions] }
}

/** A project in a temporary directory is a scratch run, not a project someone works in. */
export const isScratchPath = (path: string): boolean =>
  /^(\/private)?\/tmp(\/|$)/.test(path) || /^(\/private)?\/var\/folders\//.test(path) || /[\\/]AppData[\\/]Local[\\/]Temp([\\/]|$)/i.test(path)

/** The transcripts whose size or time differ from when they were last read, or never were. */
export const changedFiles = (files: readonly Transcript[], cached: Readonly<Record<string, Surveyed>>): Transcript[] =>
  files.filter(file => {
    const known = cached[file.name]
    return known === undefined || known.size !== file.size || known.mtimeMs !== file.mtimeMs
  })

const DAY_MS = 86_400_000

/** A browser the session drove, by its MCP server's name. */
const isBrowserServer = (server: string): boolean => /chrome|playwright|browser/i.test(server)

/**
 * What the sessions came to. `knownSkills` are the commands that are skills
 * here: a typed /clear or a typo is not a skill run. `oldest` is the oldest
 * transcript's time, absent with none.
 */
export const usageFrom = (
  tallies: Readonly<Record<string, Tally>>,
  history: History,
  knownSkills: readonly string[],
  now: number,
  oldest: number | undefined,
): Usage => {
  const entries = Object.entries(tallies)
  const known = new Set(knownSkills)
  const skillRuns: Record<string, number> = {}
  const edits: Record<string, number> = {}
  const skillSessions = new Set<string>()
  const allSessions = new Set(history.sessions)
  const servers = new Set<string>()
  const usage: Usage = {
    isRead: entries.length > 0,
    sessions: entries.length,
    days: oldest === undefined ? 0 : Math.max(1, Math.ceil((now - oldest) / DAY_MS)),
    editingSessions: 0,
    checkedSessions: 0,
    testRuns: 0,
    lintRuns: 0,
    skillSessions: 0,
    allSessions: 0,
    skillRuns,
    agentCalls: 0,
    agentSessions: 0,
    mcpCalls: 0,
    mcpServers: 0,
    browserCalls: 0,
    webCalls: 0,
    ghRuns: 0,
    edits,
  }

  for (const [session, tally] of entries) {
    allSessions.add(session)
    const tests = tally.kinds.test ?? 0
    const lints = tally.kinds.lint ?? 0
    const agents = (tally.calls.Agent ?? 0) + (tally.calls.Task ?? 0)

    if ((tally.calls.Edit ?? 0) + (tally.calls.Write ?? 0) > 0) {
      usage.editingSessions += 1
      if (tests + lints > 0) usage.checkedSessions += 1
    }

    usage.testRuns += tests
    usage.lintRuns += lints
    usage.ghRuns += tally.kinds.gh ?? 0
    usage.agentCalls += agents
    if (agents > 0) usage.agentSessions += 1
    usage.webCalls += (tally.calls.WebSearch ?? 0) + (tally.calls.WebFetch ?? 0)

    for (const [skill, runs] of Object.entries(tally.skills)) {
      bump(skillRuns, skill, runs)
      skillSessions.add(session)
    }
    for (const [extension, count] of Object.entries(tally.extensions)) bump(edits, extension, count)
    for (const [server, calls] of Object.entries(tally.mcp)) {
      servers.add(server)
      usage.mcpCalls += calls
      if (isBrowserServer(server)) usage.browserCalls += calls
    }
  }

  for (const [session, words] of Object.entries(history.typed)) {
    for (const [word, runs] of Object.entries(words)) {
      if (!known.has(word)) continue
      bump(skillRuns, word, runs)
      skillSessions.add(session)
    }
  }

  return { ...usage, skillSessions: skillSessions.size, allSessions: allSessions.size, mcpServers: servers.size }
}
