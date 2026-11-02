// What the level reads of the machine: the setup, the prompt history, and the
// session transcripts through grep. It holds no state and draws nothing, and only
// /quest-hud:level and /quest-hud:level-up call it. src/survey.ts and src/harness.ts
// turn what it reads into counts; the raw text never leaves this file's callers.
import type { EngineInterface } from 'claude-code'

import { commandFacts, enabledPlugins, settingsFacts, type Inventory } from '../src/harness'
import { isScratchPath, parseHistory, surveyReader, SURVEY_PATTERN, type History, type Tally, type Transcript } from '../src/survey'

/** A project counts once this many prompts were written in it. */
const WORKED_PROMPTS = 5
/** What `$.process.run` keeps of a tail: under its own limit of 4 MiB, as `$.fs.read` is. */
const HISTORY_TAIL = '4000000'
/** Transcripts to a spawn: an argument list has a limit. */
const FILES_PER_SCAN = 100

/** grep's exit for a file it could not open while it read the others: anything past this, or no code at all, it did not finish. */
const GREP_TROUBLE = 2

const INSTRUCTION_FILES: readonly string[] = ['CLAUDE.md', 'AGENTS.md', '.claude/CLAUDE.md']
const PROJECT_SETTINGS: readonly string[] = ['.claude/settings.json', '.claude/settings.local.json']

/** Claude Code's own directory: where it keeps sessions, history and memory. */
export async function configDir($: EngineInterface): Promise<string> {
  const set = await $.env.get('CLAUDE_CONFIG_DIR')
  if (set !== undefined && set !== '') return set

  return `${(await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''}/.claude`
}

/** The prompt history; over `$.fs.read`'s limit, its tail, whose cut first line parseHistory passes over. Missing, it is empty. */
export async function readHistory($: EngineInterface, config: string): Promise<History> {
  const path = `${config}/history.jsonl`
  const text = await $.fs.read(path).catch(async () => (await $.process.run(['tail', '-c', HISTORY_TAIL, path])).stdout).catch(() => '')

  return parseHistory(text)
}

/** A directory's entries; empty when it is not there. */
async function listed($: EngineInterface, path: string) {
  return $.fs.list(path).catch(() => [])
}

const isNote = (name: string): boolean => name.endsWith('.md') && name !== 'MEMORY.md'

/** The transcripts on disk and the notes in memory: both are found by listing, and none is opened. */
export async function readProjects($: EngineInterface, config: string): Promise<{ transcripts: Transcript[]; memoryProjects: number; memoryFiles: number }> {
  const root = `${config}/projects`
  const transcripts: Transcript[] = []
  let memoryProjects = 0
  let memoryFiles = 0

  for (const project of await listed($, root)) {
    if (project.kind !== 'dir') continue

    const dir = `${root}/${project.name}`

    for (const entry of await listed($, dir)) {
      if (entry.kind === 'file' && entry.name.endsWith('.jsonl')) {
        transcripts.push({ name: entry.name.replace(/\.jsonl$/, ''), path: `${dir}/${entry.name}`, size: entry.size, mtimeMs: entry.mtimeMs })
      }

      if (entry.kind === 'dir' && entry.name === 'memory') {
        const notes = (await listed($, `${dir}/memory`)).filter(note => note.kind === 'file' && isNote(note.name)).length
        if (notes > 0) memoryProjects += 1
        memoryFiles += notes
      }
    }
  }

  return { transcripts, memoryProjects, memoryFiles }
}

async function isThere($: EngineInterface, path: string): Promise<boolean> {
  return $.fs.exists(path).catch(() => false)
}

/** What a project's own settings files say; a broken one says nothing. */
async function projectSettings($: EngineInterface, project: string): Promise<{ isSet: boolean; facts: ReturnType<typeof settingsFacts>[] }> {
  const facts: ReturnType<typeof settingsFacts>[] = []
  let isSet = false

  for (const name of PROJECT_SETTINGS) {
    const text = await $.fs.read(`${project}/${name}`).catch(() => undefined)
    if (text === undefined) continue

    isSet = true
    try {
      facts.push(settingsFacts(JSON.parse(text)))
    } catch {
      continue
    }
  }

  return { isSet, facts }
}

/** What is set up here: read fresh each time, and no transcript is opened. Paths are used here and not kept. */
export async function readInventory($: EngineInterface, config: string, history: History, notes: { memoryProjects: number; memoryFiles: number }): Promise<Inventory> {
  const settings = await $.settings.read()
  const guardrails = [settingsFacts(settings)]
  let workedProjects = 0
  let instructedProjects = 0
  let customAgents = (await listed($, `${config}/agents`)).filter(agent => agent.name.endsWith('.md')).length
  let hasProjectSettings = false

  for (const [project, prompts] of Object.entries(history.projects)) {
    if (prompts < WORKED_PROMPTS || isScratchPath(project) || !(await isThere($, project))) continue

    workedProjects += 1

    for (const name of INSTRUCTION_FILES) {
      if (await isThere($, `${project}/${name}`)) {
        instructedProjects += 1
        break
      }
    }

    const { isSet, facts } = await projectSettings($, project)
    hasProjectSettings ||= isSet
    guardrails.push(...facts)
    customAgents += (await listed($, `${project}/.claude/agents`)).filter(agent => agent.name.endsWith('.md')).length
  }

  return {
    ...notes,
    ...commandFacts(await $.command.list()),
    workedProjects,
    instructedProjects,
    hasGlobalInstructions: await isThere($, `${config}/CLAUDE.md`),
    plugins: enabledPlugins(settings),
    customAgents,
    hasHooks: guardrails.some(facts => facts.hasHooks),
    hasDenyRules: guardrails.some(facts => facts.hasDenyRules),
    hasPermissionRules: guardrails.some(facts => facts.hasPermissionRules),
    hasAutoMode: guardrails.some(facts => facts.hasAutoMode),
    hasProjectSettings,
  }
}

/**
 * Reads the transcripts with grep, whose pattern stops inside each tool's input,
 * so no prompt or output is in the stream. Through `$.process.spawn`, as
 * `$.fs.read` refuses a large file and `$.process.run` cuts its output at 4 MiB.
 * A file swept meanwhile makes grep complain and go on, exit 2: the rest was read.
 * A batch that was killed answers as unread, so its files are not taken as read.
 * Rejects if grep cannot start.
 */
export async function scanTranscripts($: EngineInterface, files: readonly Transcript[]): Promise<{ tallies: Record<string, Tally>; unread: Transcript[] }> {
  const reader = surveyReader()
  const unread: Transcript[] = []

  for (let at = 0; at < files.length; at += FILES_PER_SCAN) {
    const batch = files.slice(at, at + FILES_PER_SCAN)
    const scan = $.process.spawn({ argv: ['grep', '-HoE', SURVEY_PATTERN, '--', ...batch.map(file => file.path)], env: { LC_ALL: 'C' } })
    const pieces = scan[Symbol.asyncIterator]()

    for (let piece = await pieces.next(); ; piece = await pieces.next()) {
      if (piece.done) {
        if (piece.value.code === null || piece.value.code > GREP_TROUBLE) unread.push(...batch)
        break
      }

      if (piece.value.stream === 'stdout') reader.feed(piece.value.text)
    }
  }

  return { tallies: reader.end(), unread }
}
