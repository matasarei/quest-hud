import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { boardView } from '../../plugins/quest-hud/src/github'
import { COMMANDS, postBoard, runCommand } from '../src/commands'
import { sampleBoard, sampleCard } from '../src/samples'
import * as S from '../src/session'

const NOW = Date.parse('2026-11-03T10:00:00Z')
const BASE: S.Settings = { detail: 'pane', bars: 'all', avatar: 'octocat', flavor: 'off', graphics: 'cells' }
const sim = () => S.startSim(BASE)
const last = (s: S.Sim) => s.transcript.at(-1) ?? ''

test('help is the mod own list, with the settings in force', () => {
  const text = last(runCommand(sim(), 'help', NOW))
  assert.match(text, /\/quest-hud:status/)
  assert.match(text, /detail\s+off \| status \| band \| pane\s+now pane \(default band\)/)
  assert.match(text, /avatar\s+wizard \| claude \| octocat\s+now octocat/)
  assert.match(text, /flavor\s+on \| off\s+now off \(default on\)/)
  assert.match(text, /zones\s+name=zone, …\s+now none/)
})

test('status lists the quest, its zone and its tasks', () => {
  const s = S.nextTask(S.addTask(S.startSkill(sim(), 'gku:implement', NOW), 'Read it'), NOW)
  const text = last(runCommand(s, 'status', NOW))
  assert.match(text, /⚔ gku:implement 0\/1/)
  assert.match(text, /Forge — building and fixing/)
  assert.match(text, /▸ Read it/)
})

test('off hides everything and on brings back what was open', () => {
  const open = runCommand({ ...sim(), settings: { ...BASE, detail: 'band' }, isRoadOpen: false }, 'pane', NOW)
  assert.equal(S.isRoadShown(open), true)

  const off = runCommand(open, 'off', NOW)
  assert.deepEqual([S.hasBand(off), S.isRoadShown(off), off.isHidden], [false, false, true])
  assert.equal(last(runCommand(off, 'off', NOW)), 'Quest HUD is already off.')
  assert.match(last(runCommand(off, 'pane', NOW)), /Quest HUD is off/)

  const on = runCommand(off, 'on', NOW)
  assert.deepEqual([S.hasBand(on), S.isRoadShown(on)], [true, true])
  assert.equal(last(on), 'Quest HUD is back.')
})

test('on says so when the detail option is what keeps it hidden', () => {
  const off = runCommand(S.withSetting(sim(), 'detail', 'off'), 'off', NOW)
  assert.match(last(runCommand(off, 'on', NOW)), /the detail option is off/)
})

test('the level comes before level-up, and shows on the Road', () => {
  assert.match(last(runCommand(sim(), 'level-up', NOW)), /No level yet/)
  const leveled = runCommand(sim(), 'level', NOW)
  assert.equal(leveled.level?.level, sampleCard().level)
  assert.match(last(leveled), /⚔ Level \d+ · /)
  assert.match(last(runCommand(leveled, 'level-up', NOW)), /Commands are printed, never run/)
})

test('quests opens the board, riding, and it fills with the example rows', () => {
  const riding = runCommand(sim(), 'quests', NOW)
  assert.equal(S.isBoardShown(riding), true)
  assert.equal(S.isRoadShown(riding), false)
  assert.equal(riding.board?.phase, 'riding')

  const posted = postBoard(riding, NOW)
  const view = boardView(posted.board, NOW, posted.isTrivialOpen)
  assert.deepEqual(view.sections.map(section => section.rank), ['boss', 'elite', 'rare', 'normal', 'minion'])
  assert.equal(view.fold, 'Show 2 Trivial')
  assert.ok(view.sections[0]?.rows[0]?.label.startsWith('example/shop'))
  assert.match(last(posted), /boss/)

  const unfolded = S.toggleTrivial(posted)
  assert.equal(boardView(unfolded.board, NOW, unfolded.isTrivialOpen).fold, 'Hide 2 Trivial')
})

test('every example row keeps a link and is dated', () => {
  const board = sampleBoard(NOW)
  assert.equal(board.quests.length, 8)
  assert.ok(board.quests.every(quest => quest.href?.startsWith('https://github.com/example/shop/')))
})

test('closing panes goes back to the other', () => {
  const both = runCommand(sim(), 'quests', NOW)
  const closed = S.closePane(both)
  assert.deepEqual([S.isBoardShown(closed), S.isRoadShown(closed)], [false, true])
  const none = S.closePane(closed)
  assert.equal(S.isRoadShown(none), false)
})

test('the words copied from register.tsx are still its words', () => {
  const source = readFileSync('plugins/quest-hud/hooks/register.tsx', 'utf8')
  const copy = readFileSync('site/src/commands.ts', 'utf8')
  const strings = (text: string) => new Set([...text.matchAll(/'([A-Z"][^'\n]{12,})'/g)].map(match => match[1]))
  const mine = strings(copy)
  assert.ok(mine.size >= 8)
  for (const words of mine) assert.ok(source.includes(`'${words}'`), `not in register.tsx: ${words}`)
})

test('the page offers every command the mod has, by its help list', () => {
  const list = last(runCommand(sim(), 'help', NOW))
  for (const command of COMMANDS) assert.ok(list.includes(`/quest-hud:${command}`), command)
  assert.equal([...list.matchAll(/^ {2}\/quest-hud:/gm)].length, COMMANDS.length)
})

test("the page's steps for the classic status line are the mod's", () => {
  const page = readFileSync('site/index.html', 'utf8')
  const source = readFileSync('plugins/quest-hud/hooks/register.tsx', 'utf8')
  const setting = '"statusLine": { "type": "command", "command": "~/.claude/hud-line.sh" }'

  assert.ok(source.includes(setting))
  assert.ok(page.includes(`<code>${setting}</code>`))
  assert.ok(source.includes('/scripts/hud-line.sh" ~/.claude/hud-line.sh'))
  assert.ok(page.includes('/scripts/hud-line.sh" ~/.claude/hud-line.sh'))
  assert.ok(page.includes('/quest-hud:statusline'))
  assert.ok(page.includes('"command": "~/.claude/hud-line.sh --all"'))
  assert.ok(readFileSync('README.md', 'utf8').includes('## Without mods'))
})
