// Play a session: the same events the buttons send, in order, with a pause after
// each. It is a script, not a recording: everything on screen is the mod's code
// answering these events.
import * as S from './session'

export type Beat = Readonly<{ wait: number; apply: (sim: S.Sim, now: number) => S.Sim }>

const say = (line: string): Beat['apply'] => sim => S.say(sim, line)
const hp = (value: number, mp?: number): Beat['apply'] => sim => (mp === undefined ? S.withHp(sim, value) : S.withMp(S.withHp(sim, value), mp))

const SHORT = 900
const LONG = 1700

export const SESSION: readonly Beat[] = [
  { wait: SHORT, apply: sim => S.setWorking(S.withMp(S.withHp(S.say(sim, '> add a CSV export'), 72), 96), true) },
  { wait: LONG, apply: (sim, now) => S.say(S.toolCall(sim, 'Read', { file_path: '/repo/src/export.ts' }, {}, now), 'Read src/export.ts') },
  { wait: SHORT, apply: (sim, now) => S.startSkill(sim, 'gku:implement', now) },
  { wait: SHORT, apply: sim => S.addTask(S.addTask(S.addTask(sim, 'Read the exporter'), 'Write the CSV writer tests'), 'Wire it in') },
  { wait: LONG, apply: (sim, now) => S.nextTask(hp(64, 82)(sim, now), now) },
  { wait: LONG, apply: (sim, now) => S.nextTask(hp(52, 70)(sim, now), now) },
  { wait: SHORT, apply: (sim, now) => S.say(S.toolCall(sim, 'Edit', { file_path: '/repo/src/csv.ts' }, {}, now), 'Edited src/csv.ts') },
  { wait: LONG, apply: sim => S.say(S.bashStart(sim, 'npm test'), '$ npm test') },
  { wait: LONG, apply: (sim, now) => S.say(hp(39, 58)(S.bashEnd(sim, 'npm test', '231 pass\n1 fail', true, now), now), '231 pass, 1 fail') },
  { wait: LONG, apply: sim => S.addCompanion(S.say(sim, 'Asking a subagent where the failure comes from.'), 'Explore') },
  { wait: LONG, apply: (sim, now) => S.dropCompanion(S.say(S.toolCall(sim, 'Edit', { file_path: '/repo/src/csv.ts' }, {}, now), 'Edited src/csv.ts')) },
  { wait: LONG, apply: sim => S.say(S.bashStart(sim, 'npm test'), '$ npm test') },
  { wait: LONG, apply: (sim, now) => S.say(hp(30, 34)(S.bashEnd(sim, 'npm test', '232 pass\n0 fail', false, now), now), '232 pass, 0 fail') },
  { wait: SHORT, apply: (sim, now) => S.say(S.bashEnd(sim, 'git commit -m "Write the CSV writer tests"', '[main 2af33ea] Write the CSV writer tests\n 2 files changed', false, now), '2 files changed') },
  { wait: LONG, apply: (sim, now) => S.nextTask(hp(24, 18)(sim, now), now) },
  { wait: LONG, apply: (sim, now) => S.say(S.compact(sim, 22, now), 'Compacted the conversation.') },
  { wait: LONG, apply: (sim, now) => S.nextTask(hp(19)(sim, now), now) },
  { wait: LONG, apply: (sim, now) => S.startSkill(hp(16)(sim, now), 'gku:pr', now) },
  { wait: LONG, apply: (sim, now) => S.say(S.bashEnd(sim, 'gh pr create --fill', 'https://github.com/example/shop/pull/42', false, now), 'Opened pull request 42') },
  { wait: SHORT, apply: say('Done. The export is up for review.') },
  { wait: 0, apply: sim => S.setWorking(sim, false) },
]
