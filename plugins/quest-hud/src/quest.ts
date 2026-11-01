// The quest the session is on: started by a skill run, or titled by a prompt.
import type { Quest, Task, Zone } from '../types'

export const TITLE_MAX = 48

// Control characters, and the bidirectional marks and overrides that can make
// a title read differently from what it holds.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g

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

// What a person pasted rather than wrote: a pasted block and fenced code,
// each closed or running to the end. Neither is the person's own words.
const PASTED = /<pasted_content\b[^>]*>[\s\S]*?(?:<\/pasted_content\b[^>]*>|$)/g
const FENCED = /```[\s\S]*?(?:```|$)/g
const LETTER = /\p{L}/u

/**
 * The words a person wrote in a prompt: pasted blocks and fenced code taken
 * out, and every line without a letter dropped (box drawing, block glyphs,
 * bare punctuation). Empty when the prompt held nothing else.
 */
export const ownWords = (text: string): string =>
  text
    .replace(PASTED, '\n')
    .replace(FENCED, '\n')
    .split('\n')
    .filter(line => LETTER.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * The quest after a plain prompt. A prompt titles a new quest when there is
 * none yet, or when the current one has no open task and the person's own
 * words in it number at least three, so "yes", "go on" or a bare paste never
 * retitle the work. A prompt that starts with `/` is a command, never a title.
 */
export const fromPrompt = (current: Quest | null, text: string, tasks: readonly Task[], now: number): Quest | null => {
  const own = ownWords(text)

  if (own === '' || text.trim().startsWith('/')) {
    return current
  }

  const words = own.split(/\s+/).length
  const isNew = current === null || (!hasOpenTask(tasks) && words >= 3)

  return isNew ? { title: cleanTitle(own), zone: 'wilds', startedAt: now } : current
}
