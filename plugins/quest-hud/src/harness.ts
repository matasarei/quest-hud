// The level: seven parts of the harness scored from 0 to 3, from what was counted.
// Pure. The scale and its thresholds are this game's own, not a benchmark; the
// guides and sensors follow Böckeler's split (martinfowler.com, 2026). Installed
// but unused never passes 1 in Skills, Tools or Delegation.
import type { CommandInfo } from 'claude-code'

import type { HarnessPart, LevelCard, Usage } from '../types'
import { cleanTitle } from './quest'

/** What is set up on this machine, read fresh: no transcript is involved. */
export type Inventory = {
  /** Projects with enough prompts to count, and those of them with a CLAUDE.md or AGENTS.md. */
  workedProjects: number
  instructedProjects: number
  hasGlobalInstructions: boolean
  memoryProjects: number
  memoryFiles: number
  /** Enabled plugins by name, without this one. */
  plugins: string[]
  /** Commands from plugins and the person's own files, without this mod's. */
  skills: string[]
  /** Every command that can be run now, by name. */
  commands: string[]
  ownSkills: number
  customAgents: number
  hasHooks: boolean
  hasDenyRules: boolean
  hasPermissionRules: boolean
  hasAutoMode: boolean
  hasProjectSettings: boolean
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const holdsAny = (value: unknown): boolean => Array.isArray(value) && value.length > 0

/** What a settings object says of the guardrails. Nothing else in it is looked at: it can hold secrets. */
export const settingsFacts = (settings: unknown): Pick<Inventory, 'hasHooks' | 'hasDenyRules' | 'hasPermissionRules' | 'hasAutoMode'> => {
  const { hooks, permissions, autoMode } = isRecord(settings) ? settings : ({} as Record<string, unknown>)
  const { allow, ask, deny, defaultMode } = isRecord(permissions) ? permissions : ({} as Record<string, unknown>)

  return {
    hasHooks: isRecord(hooks) && Object.keys(hooks).length > 0,
    hasDenyRules: holdsAny(deny),
    hasPermissionRules: holdsAny(allow) || holdsAny(ask) || holdsAny(deny),
    hasAutoMode: autoMode !== undefined || defaultMode === 'auto',
  }
}

const OWN_PLUGIN = 'quest-hud'

/** The enabled plugins by name, without their marketplace and without this mod. */
export const enabledPlugins = (settings: unknown): string[] => {
  const enabled = isRecord(settings) ? settings.enabledPlugins : undefined
  if (!isRecord(enabled)) return []

  return Object.entries(enabled)
    .filter(([, isOn]) => isOn === true)
    .map(([id]) => id.split('@')[0] ?? id)
    .filter(name => name !== OWN_PLUGIN)
}

/** What the command list says of the skills: a plugin's and the person's own, not this mod's or the built-ins. */
export const commandFacts = (commands: readonly CommandInfo[]): Pick<Inventory, 'skills' | 'commands' | 'ownSkills'> => {
  const isOwnMod = (command: CommandInfo): boolean => command.plugin === OWN_PLUGIN || command.name === OWN_PLUGIN || command.name.startsWith(`${OWN_PLUGIN}:`)
  const skills = commands.filter(command => (command.source === 'plugin' || command.source === 'user') && !isOwnMod(command))

  return {
    skills: skills.map(command => command.name),
    commands: commands.map(command => command.name),
    ownSkills: skills.filter(command => command.source === 'user').length,
  }
}

/** The titles, level 1 first: where the wizard stands. */
export const TITLES: readonly string[] = ['Novice', 'Apprentice', 'Initiate', 'Adept', 'Mage', 'Conjurer', 'Battlemage', 'Sage', 'Archmage', 'Grand Wizard']

const MAX_PART = 3

// The thresholds, in one place, each with its test on either side.
const INSTRUCTED_SOME = 0.5
const INSTRUCTED_MOST = 0.8
const MEMORY_PROJECTS = 3
const MEMORY_FILES = 20
const SKILL_SOME = 0.1
const SKILL_MOST = 0.25
const SKILL_DISTINCT = 3
const CHECKED_SOME = 0.3
const DELEGATED_SOME = 0.1
const DELEGATED_MOST = 0.25

/** The languages the official marketplace has a language server for. */
const LANGUAGES: ReadonlyArray<{ name: string; lsp: string; extensions: readonly string[] }> = [
  { name: 'PHP', lsp: 'php-lsp', extensions: ['php'] },
  { name: 'TypeScript', lsp: 'typescript-lsp', extensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'] },
  { name: 'Python', lsp: 'pyright-lsp', extensions: ['py'] },
  { name: 'Go', lsp: 'gopls-lsp', extensions: ['go'] },
  { name: 'Rust', lsp: 'rust-analyzer-lsp', extensions: ['rs'] },
  { name: 'Swift', lsp: 'swift-lsp', extensions: ['swift'] },
  { name: 'C and C++', lsp: 'clangd-lsp', extensions: ['c', 'h', 'cc', 'cpp', 'hpp', 'cxx'] },
  { name: 'Kotlin', lsp: 'kotlin-lsp', extensions: ['kt', 'kts'] },
  { name: 'Java', lsp: 'jdtls-lsp', extensions: ['java'] },
  { name: 'C#', lsp: 'csharp-lsp', extensions: ['cs'] },
  { name: 'Ruby', lsp: 'ruby-lsp', extensions: ['rb'] },
  { name: 'Lua', lsp: 'lua-lsp', extensions: ['lua'] },
]

export type Language = { name: string; lsp: string; edits: number }

/** The language with the most edits, of those with a server; other files do not count. */
export const mainLanguage = (edits: Readonly<Record<string, number>>): Language | undefined => {
  let best: Language | undefined

  for (const { name, lsp, extensions } of LANGUAGES) {
    const count = extensions.reduce((sum, extension) => sum + (edits[extension] ?? 0), 0)
    if (count > 0 && (best === undefined || count > best.edits)) best = { name, lsp, edits: count }
  }

  return best
}

const share = (part: number, whole: number): number => (whole > 0 ? part / whole : 0)

/** 1,234, in code rather than a locale's choice. */
export const thousands = (count: number): string => String(count).replace(/\B(?=(\d{3})+$)/g, ',')

const runs = (count: number): string => `${thousands(count)} ${count === 1 ? 'run' : 'runs'}`

const part = (name: string, score: number, note: string): HarnessPart => ({ name, score, note })

const instructions = ({ workedProjects: worked, instructedProjects: instructed }: Inventory): HarnessPart => {
  const of = share(instructed, worked)
  const score = instructed === 0 ? 0 : of >= INSTRUCTED_MOST ? 3 : of >= INSTRUCTED_SOME ? 2 : 1

  return part('Instructions', score, worked === 0 ? 'no project worked in yet' : `${instructed} of ${worked} projects`)
}

const memory = ({ memoryProjects: projects, memoryFiles: files, hasGlobalInstructions }: Inventory): HarnessPart => {
  const score = projects >= MEMORY_PROJECTS ? (files >= MEMORY_FILES ? 3 : 2) : projects > 0 || hasGlobalInstructions ? 1 : 0

  return part('Memory', score, projects === 0 ? (hasGlobalInstructions ? 'a global CLAUDE.md' : 'no notes kept') : `${thousands(files)} ${files === 1 ? 'note' : 'notes'} in ${projects} ${projects === 1 ? 'project' : 'projects'}`)
}

const skills = ({ skills: present, ownSkills }: Inventory, { skillSessions, allSessions, skillRuns }: Usage): HarnessPart => {
  const of = share(skillSessions, allSessions)
  const entries = Object.entries(skillRuns)
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  const top = [...entries].sort((a, b) => b[1] - a[1])[0]?.[0]
  const isMost = of >= SKILL_MOST && entries.length >= SKILL_DISTINCT && ownSkills > 0
  const score = present.length === 0 ? 0 : isMost ? 3 : of >= SKILL_SOME ? 2 : 1

  return part('Skills', score, top === undefined ? (present.length > 0 ? 'present, not run yet' : 'only the built-in commands') : `${runs(total)}, mostly ${cleanTitle(top)}`)
}

const checks = ({ isRead, editingSessions, checkedSessions, testRuns, lintRuns }: Usage): HarnessPart => {
  if (!isRead) return { name: 'Checks', note: 'usage unread' }

  const isSome = share(checkedSessions, editingSessions) >= CHECKED_SOME
  const score = testRuns + lintRuns === 0 ? 0 : !isSome ? 1 : testRuns > 0 && lintRuns > 0 ? 3 : 2

  return part('Checks', score, testRuns + lintRuns === 0 ? 'no test or lint runs seen' : `${thousands(testRuns)} test and ${thousands(lintRuns)} lint runs`)
}

const guardrails = ({ hasHooks, hasDenyRules, hasPermissionRules, hasAutoMode, hasProjectSettings }: Inventory): HarnessPart => {
  const score = hasHooks ? (hasDenyRules ? 3 : 2) : hasPermissionRules || hasAutoMode || hasProjectSettings ? 1 : 0
  const note = [
    hasHooks ? 'hooks' : 'no hooks',
    hasDenyRules ? 'deny rules' : hasPermissionRules ? 'permission rules' : 'no permission rules',
    ...(hasAutoMode ? ['auto mode'] : []),
  ].join(' · ')

  return part('Guardrails', score, note)
}

const tools = ({ plugins }: Inventory, { mcpCalls, edits }: Usage): HarnessPart => {
  const main = mainLanguage(edits)
  const hasMain = main !== undefined && plugins.includes(main.lsp)
  const hasAnyLsp = plugins.some(plugin => plugin.endsWith('-lsp'))
  const hasMcp = mcpCalls > 0
  const score = hasMain && hasMcp ? 3 : hasMain || (hasMcp && hasAnyLsp) ? 2 : hasMcp || hasAnyLsp ? 1 : 0
  const server = main === undefined ? (hasAnyLsp ? 'a language server' : 'no language server') : hasMain ? `${main.name} language server` : `no ${main.name} language server`

  return part('Tools', score, `${hasMcp ? 'MCP used' : 'no MCP used'}, ${server}`)
}

const delegation = ({ customAgents }: Inventory, { isRead, agentCalls, agentSessions, sessions }: Usage): HarnessPart => {
  if (!isRead) return { name: 'Delegation', note: 'usage unread' }

  const of = share(agentSessions, sessions)
  const score = agentCalls === 0 ? 0 : of >= DELEGATED_MOST && customAgents > 0 ? 3 : of >= DELEGATED_SOME ? 2 : 1

  return part('Delegation', score, `${thousands(agentCalls)} subagent ${agentCalls === 1 ? 'call' : 'calls'}`)
}

/** The level for `points` of `outOf`: 0 is 1, all of them 10. */
export const levelOf = (points: number, outOf: number): number => 1 + Math.round((points * (TITLES.length - 1)) / outOf)

/** The points short of the next level; undefined at the top. */
export const pointsToNext = (points: number, outOf: number): number | undefined => {
  for (let more = points + 1; more <= outOf; more++) {
    if (levelOf(more, outOf) > levelOf(points, outOf)) return more - points
  }

  return undefined
}

/** The card for what was counted. A part that could not be read leaves the sum: it is not a zero. */
export const cardOf = (inventory: Inventory, usage: Usage): LevelCard => {
  const parts = [
    instructions(inventory),
    memory(inventory),
    skills(inventory, usage),
    checks(usage),
    guardrails(inventory),
    tools(inventory, usage),
    delegation(inventory, usage),
  ]
  const read = parts.filter(one => one.score !== undefined)
  const points = read.reduce((sum, one) => sum + (one.score ?? 0), 0)
  const outOf = read.length * MAX_PART
  const level = levelOf(points, outOf)

  return { level, title: TITLES[level - 1] ?? '', points, outOf, parts, usage }
}

/** The counts in a card's usage: what the score and the quests read, each a number. */
const USAGE_COUNTS: ReadonlyArray<keyof Usage> = ['sessions', 'days', 'editingSessions', 'checkedSessions', 'testRuns', 'lintRuns', 'skillSessions', 'allSessions', 'agentCalls', 'agentSessions', 'mcpCalls', 'mcpServers', 'browserCalls', 'webCalls', 'ghRuns']

const isUsage = (value: unknown): value is Usage =>
  isRecord(value) && typeof value.isRead === 'boolean' && isRecord(value.skillRuns) && isRecord(value.edits)
  && USAGE_COUNTS.every(count => typeof value[count] === 'number')

const isPart = (value: unknown): value is HarnessPart =>
  isRecord(value) && typeof value.name === 'string' && typeof value.note === 'string'
  && (value.score === undefined || typeof value.score === 'number')

/** A card as `$.store` gave it back, or null for anything else: an older mod may have written it. */
export const asCard = (value: unknown): LevelCard | null => {
  if (!isRecord(value)) return null

  const { level, title, points, outOf, parts, usage } = value
  const isCard = typeof level === 'number' && level >= 1 && level <= TITLES.length
    && typeof title === 'string' && typeof points === 'number' && typeof outOf === 'number'
    && Array.isArray(parts) && parts.every(isPart) && isUsage(usage)

  return isCard ? (value as LevelCard) : null
}
