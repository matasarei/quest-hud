import { describe, expect, test } from 'claude-code/testing'

import { unknownText, usageText } from '../src/help'

const IN_FORCE = { detail: 'band', bars: 'all', graphics: 'cells', zones: '' }

describe('/quest-hud:help', () => {
  test('lists the commands, and each option with its values, the value in force and its default', () => {
    const text = usageText(IN_FORCE)
    for (const command of ['/quest-hud:status', '/quest-hud:pane', '/quest-hud:statusline', '/quest-hud:help']) expect(text).toContain(command)
    expect(text).toContain('set with /plugin configure quest-hud@quest-hud')
    expect(text).toContain('detail    off | status | band | pane')
    expect(text).toContain('now cells (default auto)')
    expect(text).toContain('now all (default hpmp)')
    expect(text).toContain('now none')
    expect(text).toContain('zones: watchtower, harbour, dungeon, arena, forge, map, camp, wilds')
  })

  test('a word /quest-hud does not know is named, cleaned, before the list', () => {
    const text = unknownText('pan', IN_FORCE)
    expect(text.split('\n')[0]).toBe('No /quest-hud pan.')
    expect(text).toContain(usageText(IN_FORCE))
    expect(unknownText('pan\u202e\u0007x', IN_FORCE).split('\n')[0]).toBe('No /quest-hud pan x.')
  })
})
