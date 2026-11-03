import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { bandModel, hintText, TONE_COLOR } from '../../plugins/quest-hud/src/meters'
import * as S from '../src/session'

const NOW = Date.parse('2026-11-03T10:00:00Z')
const BASE: S.Settings = { detail: 'band', bars: 'hpmp', avatar: 'wizard', graphics: 'auto', zones: '' }
const sim = (settings: Partial<S.Settings> = {}) => S.startSim({ ...BASE, ...settings })
const text = (segments: ReadonlyArray<{ text: string }>) => segments.map(segment => segment.text).join('')

test('the sliders reach the figures the band draws', () => {
  const band = bandModel(null, [], S.metersOf(S.withMp(S.withHp(sim(), 39), 20), NOW), 'hpmp', NOW)

  assert.match(text(band.meters), /♥ HP .* 39% week · heals in 2d 4h/)
  assert.match(text(band.meters), /✦ MP .* 20% ctx · 160k\/200k/)
})

test('HP takes its colour from the real rule at each boundary', () => {
  const colourAt = (hp: number) => bandModel(null, [], S.metersOf(S.withHp(sim(), hp), NOW), 'hpmp', NOW).meters[0]?.tone
  assert.deepEqual([40, 39, 20, 19].map(colourAt), ['hp', 'hpLow', 'hpLow', 'hpCritical'])
  assert.notEqual(TONE_COLOR.hpLow, TONE_COLOR.hp)
})

test('the sliders stay in range', () => {
  assert.equal(S.withHp(sim(), 140).hp, 100)
  assert.equal(S.withHp(sim(), -3).hp, 0)
  assert.equal(S.withCost(sim(), -1).cost, 0)
})

test('bars = all adds the 5-hour window and the cost', () => {
  const all = (bars: 'hpmp' | 'all') => text(bandModel(null, [], S.metersOf(sim(), NOW), bars, NOW).meters)
  assert.doesNotMatch(all('hpmp'), /⚡5h/)
  assert.match(all('all'), /⚡5h 34%.*◉ \$1\.84/)
})

test('detail decides what is drawn, as a reloaded session would', () => {
  const at = (detail: S.Detail) => {
    const s = S.withSetting(sim(), 'detail', detail)
    return [S.hasHint(s), S.hasBand(s), S.isRoadShown(s)]
  }
  assert.deepEqual(at('off'), [false, false, false])
  assert.deepEqual(at('status'), [true, false, false])
  assert.deepEqual(at('band'), [false, true, false])
  assert.deepEqual(at('pane'), [false, true, true])
})

test('a skill starts a quest in its zone, and logs it', () => {
  const s = S.startSkill(sim(), 'gku:implement', NOW)
  assert.equal(s.quest?.zone, 'forge')
  assert.equal(s.log.at(-1)?.text, 'gku:implement · Forge')
  assert.equal(S.endSkill(s).quest, null)
})

test('a skill with no rule is in the Wilds', () => {
  assert.equal(S.startSkill(sim(), 'zzz', NOW).quest?.zone, 'wilds')
})

test('tasks start, finish and log through the real task calls', () => {
  let s = S.addTask(S.addTask(sim(), 'first'), 'second')
  s = S.nextTask(s, NOW)
  assert.deepEqual(s.tasks.map(t => t.status), ['in_progress', 'pending'])
  s = S.nextTask(s, NOW)
  assert.deepEqual(s.tasks.map(t => t.status), ['completed', 'in_progress'])
  assert.equal(s.log.at(-1)?.text, '✓ first')
  s = S.nextTask(s, NOW)
  assert.deepEqual(s.tasks.map(t => t.status), ['completed', 'completed'])
  assert.equal(S.nextTask(s, NOW).log.length, s.log.length)
})

test('a test run is a fight: lost leaves the monster standing, won clears it', () => {
  const lost = S.bashEnd(S.bashStart(sim(), 'npm test'), 'npm test', '231 pass\n1 fail', true, NOW)
  assert.equal(lost.foes.test, 'standing')
  assert.match(lost.log.at(-1)?.text ?? '', /tests lost/)

  const during = S.bashStart(lost, 'npm test')
  assert.equal(during.foes.test, 'fighting')

  const won = S.bashEnd(during, 'npm test', '232 pass\n0 fail', false, NOW)
  assert.equal(won.foes.test, 'none')
  assert.match(won.log.at(-1)?.text ?? '', /tests won/)
})

test('a commit drops loot; a refused one does not', () => {
  const stdout = '[main 2af33ea] Write the tests\n 1 file changed'
  const s = S.bashEnd(sim(), 'git commit -m x', stdout, false, NOW)
  assert.equal(s.loot, 1)
  assert.equal(s.log.at(-1)?.text, '2af33ea Write the tests')
  assert.equal(S.bashEnd(sim(), 'git commit -m x', 'hook said no', true, NOW).loot, 0)
})

test('gh brings the octopus and glab the fox', () => {
  const gh = S.bashEnd(sim(), 'gh pr view 3', '', false, NOW)
  assert.deepEqual(gh.allies, { octopus: true, fox: false })
  assert.deepEqual(S.bashEnd(gh, 'glab mr view 3', '', false, NOW).allies, { octopus: true, fox: true })
})

test('a read goes to the map and an edit to the forge when no skill runs', () => {
  assert.equal(S.toolCall(sim(), 'Read', { file_path: '/a.ts' }, {}, NOW).activity, 'map')
  const edited = S.toolCall(sim(), 'Edit', { file_path: '/a.ts' }, {}, NOW)
  assert.equal(edited.activity, 'forge')
  assert.match(edited.log.at(-1)?.text ?? '', /a\.ts/)
})

test('compacting gives MP back, and logs the sizes', () => {
  const s = S.compact(S.withMp(sim(), 10), 20, NOW)
  assert.equal(s.mp, 80)
  assert.equal(s.log.at(-1)?.text, '180k → 40k')
})

test('subagents join and leave, oldest first', () => {
  const s = S.addCompanion(S.addCompanion(sim(), 'Explore'), 'reviewer')
  assert.deepEqual(s.companions.map(c => c.type), ['Explore', 'reviewer'])
  assert.deepEqual(S.dropCompanion(s).companions.map(c => c.type), ['reviewer'])
})

test('the hint line carries the real hint text', () => {
  assert.match(hintText(null, [], S.metersOf(sim(), NOW), 'hpmp'), /^♥▰+▱* 62% ✦▰+▱* 59%$/)
})

test('no timer while idle; one while working; none under reduced motion', () => {
  const idle = sim({ detail: 'band' })
  assert.equal(S.needsTimer(idle), false)
  assert.equal(S.needsTimer(S.setWorking(idle, true)), true)
  assert.equal(S.needsTimer(S.setWorking(sim({ detail: 'off' }), true)), false)
  assert.equal(S.needsTimer(S.setWorking(S.startSim(BASE, true), true)), false)
})

test('the walk steps only while working, and rests at the end of a turn', () => {
  const walking = S.tickSim(S.tickSim(S.setWorking(sim(), true)))
  assert.notDeepEqual(walking.motion, sim().motion)
  assert.equal(S.tickSim(sim()).tick, 0)
  assert.equal(S.setWorking(walking, false).motion.pose, 'stand')
})

test("the page's frame time is the mod's", () => {
  const source = readFileSync('plugins/quest-hud/hooks/register.tsx', 'utf8')
  assert.match(source, /export const ANIM_MS = 250\b/)
  assert.match(readFileSync('site/src/main.ts', 'utf8'), /const ANIM_MS = 250\b/)
})
