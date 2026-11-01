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
  /** Context used, 0–100; absent until the live window's first response. */
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
  kind: 'skill' | 'scout' | 'cast' | 'fork' | 'task' | 'plan' | 'camp' | 'fight' | 'loot' | 'ally'
  text: string
  /** The main turn it happened in: scout lines of one turn merge. */
  turn?: string
  counts?: ScoutCounts
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
    }
  }
}
