// The mod's commands on the page. The answers built from src/ are the mod's own.
// Those register.tsx writes inline are copied here, and a test holds them to it.
import { postedText, ridingBoard } from '../../plugins/quest-hud/src/github'
import { usageText } from '../../plugins/quest-hud/src/help'
import { levelText, levelUpText, NO_LEVEL_YET } from '../../plugins/quest-hud/src/levelup'
import { statusText, zoneLine } from '../../plugins/quest-hud/src/meters'
import { cleanTitle } from '../../plugins/quest-hud/src/quest'
import { sampleBoard, sampleCard, SAMPLE_INVENTORY } from './samples'
import { metersOf, say, type Sim } from './session'

export const OFF_ALREADY = 'Quest HUD is off. /quest-hud:on brings it back.'

/** Where a plugin would live, for the answer that names its path. */
const SAMPLE_ROOT = '~/.claude/plugins/cache/quest-hud/quest-hud/2d6af4a'

const statuslineText = (root: string): string =>
  [
    'Quest HUD, for sessions where mods do not run: a status-line script with the HP and MP bars.',
    'Copy it where an update cannot move it, then add the setting to ~/.claude/settings.json:',
    '',
    `  cp "${root}/scripts/hud-line.sh" ~/.claude/hud-line.sh`,
    '',
    '  "statusLine": { "type": "command", "command": "~/.claude/hud-line.sh" }',
    '',
    'The 5-hour window shows once it runs low. To show it always, and the cost as well, end the command with --all.',
    '',
    'It needs jq.',
  ].join('\n')

const statusAnswer = (sim: Sim, now: number): string =>
  [
    statusText(sim.quest, sim.tasks, metersOf(sim, now), 'all', now),
    `  ${zoneLine(sim.quest?.zone ?? 'wilds')}`,
    ...sim.tasks.map(task => `  ${task.status === 'completed' ? '✓' : task.status === 'in_progress' ? '▸' : '·'} ${cleanTitle(task.subject)}`),
  ].join('\n')

const turnOff = (sim: Sim): { sim: Sim; text: string } =>
  sim.isHidden
    ? { sim, text: 'Quest HUD is already off.' }
    : {
        sim: { ...sim, isHidden: true, roadWasOpen: sim.isRoadOpen, isRoadOpen: false, isBoardOpen: false, motion: { ...sim.motion, pose: 'stand' } },
        text: 'Quest HUD is off, in every session. /quest-hud:on brings it back.',
      }

const turnOn = (sim: Sim): { sim: Sim; text: string } => {
  if (!sim.isHidden) return { sim, text: 'Quest HUD is already on.' }

  const isRoadOpen = sim.roadWasOpen || sim.settings.detail === 'pane'
  return {
    sim: { ...sim, isHidden: false, roadWasOpen: false, isRoadOpen, pane: 'road' },
    text: sim.settings.detail === 'off' ? 'Quest HUD is on, but the detail option is off: /plugin configure quest-hud@quest-hud changes it.' : 'Quest HUD is back.',
  }
}

export const COMMANDS = ['status', 'pane', 'level', 'level-up', 'quests', 'statusline', 'off', 'on', 'help'] as const
export type Command = (typeof COMMANDS)[number]

const answer = (sim: Sim, command: Command, now: number): { sim: Sim; text: string } => {
  switch (command) {
    case 'help':
      return { sim, text: usageText(sim.settings) }
    case 'status':
      return { sim, text: statusAnswer(sim, now) }
    case 'statusline':
      return { sim, text: statuslineText(SAMPLE_ROOT) }
    case 'pane':
      return sim.isHidden ? { sim, text: OFF_ALREADY } : { sim: { ...sim, isRoadOpen: true, pane: 'road' }, text: 'The Road is open.' }
    case 'off':
      return turnOff(sim)
    case 'on':
      return turnOn(sim)
    case 'level': {
      const card = sampleCard()
      return { sim: { ...sim, level: card }, text: levelText(card) }
    }
    case 'level-up':
      return { sim, text: sim.level === null ? NO_LEVEL_YET : levelUpText(sim.level, SAMPLE_INVENTORY) }
    case 'quests':
      return sim.isHidden
        ? { sim, text: OFF_ALREADY }
        : { sim: { ...sim, isBoardOpen: true, pane: 'board', board: ridingBoard(sim.board, now) }, text: 'The herald rides to GitHub. The Quest Board fills when they return.' }
  }
}

/** Runs a command: its line and its answer in the session's text. */
export const runCommand = (sim: Sim, command: Command, now: number): Sim => {
  const done = answer(sim, command, now)
  return say(done.sim, `> /quest-hud:${command}`, done.text)
}

/** The read of GitHub comes back: the board fills with the example rows, and the counts are said. */
export const postBoard = (sim: Sim, now: number): Sim => {
  const board = sampleBoard(now)
  return say({ ...sim, board }, postedText(board))
}
