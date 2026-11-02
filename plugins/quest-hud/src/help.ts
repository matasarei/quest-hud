// What `/hud help` prints: the subcommands, and the options with their values,
// their defaults and the values in force. A word /hud does not know answers
// with the same list, the word echoed cleaned. Pure.
import { cleanTitle } from './quest'

/** An option as plugin.json declares it: its values (none for free text) and its default. */
export type OptionInfo = { name: string; values: readonly string[]; fallback: string }

/** The options, in the order the README lists them. A test keeps this in step with plugin.json. */
export const OPTIONS: readonly OptionInfo[] = [
  { name: 'detail', values: ['off', 'status', 'band', 'pane'], fallback: 'band' },
  { name: 'bars', values: ['hpmp', 'all'], fallback: 'hpmp' },
  { name: 'graphics', values: ['auto', 'cells', 'images'], fallback: 'auto' },
  { name: 'zones', values: [], fallback: '' },
]

/** The values in force, by option name, as register parsed them. */
export type Settings = Readonly<Record<string, string>>

const SUBCOMMANDS: ReadonlyArray<readonly [string, string]> = [
  ['/hud', 'the quest, its zone and its tasks'],
  ['/hud pane', 'open the Road beside the transcript, at any width'],
  ['/hud statusline', 'set up the HP and MP bars where mods do not run'],
  ['/hud help', 'this list'],
]

const ZONE_NAMES = 'watchtower, harbour, dungeon, arena, forge, map, camp, wilds'

/** The list `/hud help` prints. */
export const usageText = (settings: Settings): string => {
  const commandWidth = Math.max(...SUBCOMMANDS.map(([command]) => command.length))
  const nameWidth = Math.max(...OPTIONS.map(option => option.name.length))
  const choices = (option: OptionInfo): string => (option.values.length > 0 ? option.values.join(' | ') : 'name=zone, …')
  const choiceWidth = Math.max(...OPTIONS.map(option => choices(option).length))
  const shown = (value: string | undefined): string => (value === undefined || value === '' ? 'none' : value)

  return [
    'Quest HUD',
    ...SUBCOMMANDS.map(([command, what]) => `  ${command.padEnd(commandWidth)}  ${what}`),
    '',
    'Options, set in /config (a change reloads the mod):',
    ...OPTIONS.flatMap(option => {
      const now = `now ${shown(settings[option.name])}`
      const fallback = option.fallback === '' ? '' : ` (default ${option.fallback})`
      const line = `  ${option.name.padEnd(nameWidth)}  ${choices(option).padEnd(choiceWidth)}  ${now}${fallback}`
      return option.name === 'zones' ? [line, `  ${''.padEnd(nameWidth)}  zones: ${ZONE_NAMES}`] : [line]
    }),
  ].join('\n')
}

/** What a word /hud does not know answers: that it does not, then the list. */
export const unknownText = (word: string, settings: Settings): string =>
  [`No /hud ${cleanTitle(word)}.`, '', usageText(settings)].join('\n')
