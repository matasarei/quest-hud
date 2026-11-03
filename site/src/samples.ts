// Example data for what the mod reads from a machine and from GitHub: invented,
// and labelled as such on the page. The scoring, ranking and words are the mod's.
import { finishQuests, questOf } from '../../plugins/quest-hud/src/github'
import { cardOf, type Inventory } from '../../plugins/quest-hud/src/harness'
import type { Board, LevelCard, Usage } from '../../plugins/quest-hud/types'

const DAY_MS = 86_400_000

export const SAMPLE_INVENTORY: Inventory = {
  workedProjects: 4,
  instructedProjects: 3,
  hasGlobalInstructions: true,
  memoryProjects: 1,
  memoryFiles: 3,
  plugins: ['quality-tools'],
  skills: ['quality-tools:review', 'deploy', 'release-notes'],
  commands: ['/review', '/deploy', '/release-notes', '/help'],
  ownSkills: 2,
  customAgents: 0,
  hasHooks: false,
  hasDenyRules: false,
  hasPermissionRules: true,
  hasAutoMode: false,
  hasProjectSettings: true,
}

export const SAMPLE_USAGE: Usage = {
  isRead: true,
  sessions: 48,
  days: 30,
  editingSessions: 31,
  checkedSessions: 19,
  testRuns: 64,
  lintRuns: 12,
  skillSessions: 22,
  allSessions: 52,
  skillRuns: { 'quality-tools:review': 9, deploy: 4, 'release-notes': 2 },
  agentCalls: 6,
  agentSessions: 4,
  mcpCalls: 0,
  mcpServers: 0,
  browserCalls: 0,
  webCalls: 3,
  ghRuns: 40,
  edits: { ts: 210, md: 25 },
}

export const sampleCard = (): LevelCard => cardOf(SAMPLE_INVENTORY, SAMPLE_USAGE)

/** The Quest Board after a read, from invented rows run through the mod's own ranking. */
export const sampleBoard = (now: number): Board => {
  const at = (days: number): number => now - days * DAY_MS
  const pull = (n: number): string => `https://github.com/example/shop/pull/${n}`
  const issue = (n: number): string => `https://github.com/example/shop/issues/${n}`
  const rows = [
    questOf({ rank: 'boss', url: 'https://github.com/example/shop/security/secret-scanning/7', title: 'A cloud key committed to the repository', at: at(1), why: 'secret alert', isSecurity: true }),
    questOf({ rank: 'elite', url: pull(42), title: 'Add a CSV export', at: at(0.2), why: 'review asked of you', isUnread: true }),
    questOf({ rank: 'rare', url: pull(40), title: 'Fix the rounding in invoices', at: at(2), why: 'checks failed' }),
    questOf({ rank: 'normal', url: issue(31), title: 'Export drops the last column', at: at(5), why: 'assigned to you' }),
    questOf({ rank: 'normal', url: pull(38), title: 'Move the session store', at: at(9), why: 'your pull request' }),
    questOf({ rank: 'minion', url: pull(44), title: 'Bump a dependency', at: at(3), why: 'a bot asks for review' }),
    questOf({ rank: 'trivial', url: issue(12), title: 'Tidy the old test fixtures', at: at(120) }),
    questOf({ rank: 'trivial', url: issue(9), title: 'A better favicon', at: at(200) }),
  ]

  return { phase: 'done', at: now, quests: finishQuests(rows, now).quests, isPartial: false, notes: [] }
}
