import { describe, expect, test } from 'claude-code/testing'

import { unknownText, usageText } from '../src/help'

const IN_FORCE = { detail: 'band', bars: 'all', graphics: 'cells', zones: '' }

describe('/hud help', () => {
  test('lists the four subcommands, and each option with its values, the value in force and its default', () => {
    const text = usageText(IN_FORCE)
    for (const command of ['/hud ', '/hud pane', '/hud statusline', '/hud help']) expect(text).toContain(command)
    expect(text).toContain('set in /config')
    expect(text).toContain('detail    off | status | band | pane')
    expect(text).toContain('now cells (default auto)')
    expect(text).toContain('now all (default hpmp)')
    expect(text).toContain('now none')
    expect(text).toContain('zones: watchtower, harbour, dungeon, arena, forge, map, camp, wilds')
  })

  test('a word /hud does not know is named, cleaned, before the list', () => {
    const text = unknownText('pan', IN_FORCE)
    expect(text.split('\n')[0]).toBe('No /hud pan.')
    expect(text).toContain(usageText(IN_FORCE))
    expect(unknownText('pan\u202e\u0007x', IN_FORCE).split('\n')[0]).toBe('No /hud pan x.')
  })
})
