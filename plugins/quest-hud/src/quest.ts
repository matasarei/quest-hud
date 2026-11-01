// The quest the session is on: started by a skill run, or titled by a prompt.
import type { Quest, Task, Zone } from '../types'

export const TITLE_MAX = 48

// Control characters, and the bidirectional marks and overrides that can make
// a title read differently from what it holds.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g

/** One line, at most TITLE_MAX characters, cut with an ellipsis. */
export const cleanTitle = (text: string): string => {
  const line = text.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim()
  const chars = [...line]

  return chars.length > TITLE_MAX ? `${chars.slice(0, TITLE_MAX - 1).join('').trimEnd()}…` : line
}

/** A skill run always starts a new quest, titled by the skill's name. */
export const fromSkill = (skill: string, zone: Zone, now: number): Quest => ({
  title: cleanTitle(skill),
  skill,
  zone,
  startedAt: now,
})

const hasOpenTask = (tasks: readonly Task[]): boolean => tasks.some(task => task.status !== 'completed')

/**
 * The quest after a plain prompt. A prompt titles a new quest when there is
 * none yet, or when the current one has no open task and the prompt has at
 * least three words, so "yes" or "go on" never retitle the work. A prompt
 * that starts with `/` is a command, never a title.
 */
export const fromPrompt = (current: Quest | null, text: string, tasks: readonly Task[], now: number): Quest | null => {
  const trimmed = text.trim()

  if (trimmed === '' || trimmed.startsWith('/')) {
    return current
  }

  const words = trimmed.split(/\s+/).length
  const isNew = current === null || (!hasOpenTask(tasks) && words >= 3)

  return isNew ? { title: cleanTitle(trimmed), zone: 'wilds', startedAt: now } : current
}
