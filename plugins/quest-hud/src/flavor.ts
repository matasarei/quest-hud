// The line above the band's quest: a tip when this session calls for one, else
// a word from the zone. Pure and fixed: nothing here reads outside text, and
// nothing reaches the model. The lines are this mod's own, in the spirit of table
// and raid games: never a quoted line, a named character or a setting's name.
import type { Foes, Zone } from '../types'

/** What the line is chosen from: `hp` is absent on an account with no weekly limit. */
export type FlavorFacts = { zone: Zone; foes: Foes; hp: number | undefined; mp: number }

/** Below this percent, a bar is worth a tip. */
const LOW_PERCENT = 20

export const FLAVOR: Readonly<Record<Zone, readonly string[]>> = {
  forge: [
    'The anvil is hot. Strike while it lasts.',
    'Measure twice. The dwarves will know.',
    'Sparks fly. Nobody checks the bellows.',
    'Good steel takes more than one heat.',
    'Quench it now and it will crack later.',
    'The smith reads the metal, not the manual.',
    'A dull blade still needs a steady hand.',
    'Repair bills are cheaper before the raid.',
  ],
  map: [
    'Mark the traps before the party finds them.',
    'Every good raid starts with a map nobody reads.',
    'Here be dragons. Probably in the old code.',
    'The scout returns with more questions.',
    'Plan the route. The route will change.',
    'Count the doors before you open one.',
    'An hour at the map saves a day in the swamp.',
    'Someone should read the old scrolls first.',
  ],
  arena: [
    'Roll for initiative.',
    'The crowd wants a clean run.',
    'Natural twenty. Run it again to be sure.',
    'The first pull tells you what you are facing.',
    'Hold for the tank. Then check the logs.',
    'Every boss has a pattern. Learn this one.',
    'A wipe is only data, if you read the log.',
    'Saving throw against a flaky test.',
  ],
  harbour: [
    'The tide waits for no merge.',
    'Cargo checked. Sails up.',
    'Mind the rocks on the way out of port.',
    'A ship in harbour ships nothing.',
    'The harbour master wants it in writing.',
    'Check the manifest once more before you sail.',
    'Fair winds and a green build.',
    'The crew reads the orders. Write them well.',
  ],
  watchtower: [
    "Something moves in another's diff.",
    'Keep watch. Say what you see.',
    'Perception check: what did the author miss?',
    'A torch on the far hill. Worth a comment.',
    'The watch trusts the signal, not the rumour.',
    'Someone approaches. They bring forty files.',
    'From up here, the small changes look small.',
    'Sound the horn only for real raiders.',
  ],
  dungeon: [
    'You hear dripping. You check for traps anyway.',
    'Bring a ten-foot pole, just in case.',
    'The walls here are older than the team.',
    'Search the room. Then search it again.',
    'Something was buried down here on purpose.',
    'Your torch shows one more corridor.',
    'The map ends. The dungeon does not.',
    'Rats, again. There is always a bigger rat.',
  ],
  camp: [
    'A long rest restores the party.',
    'Sharpen the blades. Write it down.',
    'The fire is low. Tell the next watch what you saw.',
    'Mend the gear while nothing is on fire.',
    'Whoever packs the tent thanks whoever labelled it.',
    'Set the traps around camp before you sleep.',
    'Buff up. The next pull is a long one.',
    'A tidy camp is a quiet morning.',
  ],
  wilds: [
    "Don't pull yet. The healer is getting a drink.",
    'A wandering party, looking for a quest.',
    'No quest yet. The road is open.',
    'A stranger at the inn has a job for you.',
    "An exclamation mark hangs over a stranger's head.",
    'Need before greed. Someone rolled on everything.',
    'Wolves, ten of them. Somebody needs the pelts.',
    'Random encounter: a TODO from long ago.',
  ],
}

/** What this session calls for, most pressing first; undefined when nothing does. */
export const tipFor = ({ foes, hp, mp }: FlavorFacts): string | undefined => {
  if (foes.test === 'standing') return 'The monster stands until the tests pass.'
  if (foes.lint === 'standing') return 'The monster stands until the lint is clean.'
  if (mp < LOW_PERCENT) return 'MP runs low. /compact makes room, /clear starts fresh.'
  if (hp !== undefined && hp < LOW_PERCENT) return 'HP runs low. /usage shows what is left this week.'
  return undefined
}

/**
 * The line for this step. A tip takes every other step: HP can stay low for days,
 * and a line that never changes stops being read.
 */
export const bandLine = (facts: FlavorFacts, step: number): string => {
  const tip = step % 2 === 0 ? tipFor(facts) : undefined
  const lines = FLAVOR[facts.zone]

  return tip ?? lines[step % lines.length] ?? ''
}
