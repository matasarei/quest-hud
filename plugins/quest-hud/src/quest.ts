// The quest the session is on: a skill's run, from its start until a prompt
// shows it is over. With no skill running there is no quest: the Wilds.
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
 * The quest after a person's prompt. A prompt is never shown: the person just
 * typed it. It only ends a skill's quest that looks finished: no task open,
 * and at least three words of the person's own, so "yes", "go on" or a bare
 * paste never end it. A prompt that starts with `/` is a command and ends
 * nothing; a skill it runs starts its own quest.
 */
export const afterPrompt = (current: Quest | null, text: string, tasks: readonly Task[]): Quest | null => {
  const own = ownWords(text)

  if (current === null || own === '' || text.trim().startsWith('/') || hasOpenTask(tasks)) {
    return current
  }

  return own.split(/\s+/).length >= 3 ? null : current
}
