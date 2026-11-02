// The HUD's own types, and the values it keeps for the session in $.state.

/** Where a skill's work happens, in the game's terms. */
export type Zone = 'watchtower' | 'harbour' | 'dungeon' | 'arena' | 'forge' | 'map' | 'camp' | 'wilds'

/** The piece of work the session is on: a skill run, or a prompt. */
export type Quest = {
  title: string
  skill?: string
  zone: Zone
  startedAt: number
}

/** One entry of Claude Code's own task list, as the task tools last left it. */
export type Task = {
  id: string
  subject: string
  status: 'pending' | 'in_progress' | 'completed'
}

/** The session's figures, as `session.measure` last pushed them. */
export type Meters = {
  /** Context used, 0–100; absent until the live window's first response, and drawn as none spent. */
  contextPercent?: number
  contextTokens?: number
  window: number
  /** Percent used of the 7-day window; absent when the account reports none. */
  weekUsed?: number
  weekResetsAt?: string
  fiveHourUsed?: number
  costUsd?: number
}

/** What reading and searching came to in one turn, kept as numbers so lines merge. */
export type ScoutCounts = { reads: number; searches: number; pages: number }

/** A run Claude Code fights: a test run, or a lint or type check. */
export type FightKind = 'test' | 'lint'

/** A monster on the Road: none, fought right now, or still standing after a lost run. */
export type Foe = 'none' | 'fighting' | 'standing'
export type Foes = Readonly<Record<FightKind, Foe>>

/** The characters a session's gh and glab calls brought to the Road. */
export type Allies = Readonly<{ octopus: boolean; fox: boolean }>

/** One line of the pane's log: what Claude did, as Claude Code reported it. */
export type LogEntry = {
  at: number
  kind: 'skill' | 'scout' | 'cast' | 'fork' | 'task' | 'plan' | 'camp' | 'fight' | 'loot' | 'ally' | 'level'
  text: string
  /** The main turn it happened in: scout lines of one turn merge. */
  turn?: string
  counts?: ScoutCounts
}

/** What the sessions on this machine came to, as counts: never a prompt, a command or a path. */
export type Usage = {
  /** Transcripts were read and held tool calls; false when they could not be, or their format changed. */
  isRead: boolean
  /** Transcripts read, and the days from the oldest of them to now. */
  sessions: number
  days: number
  /** Sessions that edited a file, and those of them that ran a test or a linter. */
  editingSessions: number
  checkedSessions: number
  testRuns: number
  lintRuns: number
  /** Sessions that ran a skill, out of every session the transcripts and the prompt history know. */
  skillSessions: number
  allSessions: number
  /** Runs per skill, typed or called. */
  skillRuns: Record<string, number>
  agentCalls: number
  agentSessions: number
  mcpCalls: number
  mcpServers: number
  browserCalls: number
  webCalls: number
  ghRuns: number
  /** Files edited or written, by extension. */
  edits: Record<string, number>
}

/** One part of the harness, as scored. `score` is absent when it could not be read at all. */
export type HarnessPart = { name: string; score?: number; note: string }

/** What /quest-hud:level last worked out; the Road draws its level and title. */
export type LevelCard = {
  level: number
  title: string
  points: number
  /** What the points are out of: less than the whole when a part could not be read. */
  outOf: number
  parts: HarnessPart[]
  usage: Usage
}

/** Where a GitHub quest stands on the ladder, highest first: WoW's creature classifications. */
export type QuestRank = 'boss' | 'rareElite' | 'elite' | 'rare' | 'normal' | 'minion' | 'trivial'

/** One row of the Quest Board. Its title is outside text: cleaned, and drawn only on the board. */
export type BoardQuest = {
  /** What two sources of one quest share. */
  id: string
  rank: QuestRank
  /** The kind's place within the rank, lowest first. */
  order: number
  /** Where the row links to; absent when the link failed its check. */
  href?: string
  label: string
  title: string
  /** Why it is on the board, in the HUD's own words; may be empty. */
  why: string
  at: number
  isUnread: boolean
  isSecurity: boolean
}

/** Why a sync came back with nothing: gh would not run, is not signed in, or GitHub gave nothing to read. */
export type BoardFailure = 'no-gh' | 'no-login' | 'no-answer'

/** The Quest Board, as the last /quest-hud:sync left it. Kept for the session only, never in `$.store`. */
export type Board = {
  phase: 'riding' | 'scanning' | 'done'
  at: number
  quests: BoardQuest[]
  failure?: BoardFailure
  /** Some part of GitHub went unread, so a short list may not mean a clear road. */
  isPartial: boolean
  /** What the sync could not do or read, in the HUD's own words. */
  notes: string[]
}

/** A subagent at work, drawn as a ghost behind the avatar. */
export type Companion = { id: string; type: string }

declare module 'claude-code' {
  interface PluginState {
    'quest-hud': {
      /** The session the values below belong to: a new id (/clear, resume) starts them over. */
      sessionId: string | null
      quest: Quest | null
      tasks: Task[]
      meters: Meters | null
      /** The pane's log, newest last, at most 50. */
      log: LogEntry[]
      /** Subagents at work. */
      companions: Companion[]
      /** The Wilds' backdrop, from the last tool kind: reading is the map room, editing the forge. */
      activity: Zone | null
      /** A main turn is running: the scene bobs while the pane is shown as cells. */
      isWorking: boolean
      /** Whether the terminal shows images, as the probe found: null until it has run. */
      imagesWork: boolean | null
      /** The monsters on the Road: one per kind of fight, standing after a lost run. */
      foes: Foes
      /** The commits made this session: a chest on the Road once there is one. */
      loot: number
      /** The octopus once gh ran this session, the fox once glab did. */
      allies: Allies
      /** /quest-hud:off is in force: nothing is drawn. Read from `$.store` at each start. */
      hidden: boolean
      /** What /quest-hud:level last worked out; kept in `$.store`, loaded at each start. Null before the first run. */
      level: LevelCard | null
      /** What the last /quest-hud:sync posted; null before the first. */
      board: Board | null
      /** The board's Trivial rows are unfolded. */
      isTrivialOpen: boolean
      /** The counts each sync placed in the transcript, by row id: counts only, never a title. */
      posted: Record<string, string>
    }
  }
}
