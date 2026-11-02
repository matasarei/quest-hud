import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { engine, RUN, start, world } from './kit'

const run = async ($: Engine, command: string, args = ''): Promise<string> =>
  (await $.command.run({ command, args, ...RUN })).text ?? ''

const board = (surface: 'terminal' | 'desktop' = 'terminal', bodyColumns = 90) => ({
  plugin: 'quest-hud',
  component: 'Pane',
  requestId: 'quest-board',
  surface,
  viewport: { columns: bodyColumns + 2, rows: 30 },
  props: {
    id: 'quest-board',
    title: 'The Quest Board',
    isFocused: false,
    bodyColumns,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
}) as const

describe('/quest-hud:sync', () => {
  test('opens the board and answers, by either name', async ($, on) => {
    engine(on)
    await start($)
    expect(await run($, 'quest-hud:sync')).toContain('Quest Board')
    expect(world.opened).toEqual(['quest-board'])
    expect(await run($, 'quest-hud', 'sync')).toContain('Quest Board')
    expect(world.opened).toEqual(['quest-board', 'quest-board'])
  })

  test('while the HUD is off it opens nothing, and says so', async ($, on) => {
    engine(on, { hidden: true })
    await start($)
    expect(await run($, 'quest-hud:sync')).toContain('Quest HUD is off')
    expect(world.opened).toEqual([])
  })

  test('a board that was never posted says how to post it', async ($, on) => {
    engine(on)
    await start($)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(board(surface))
      expect(await ui.find({ type: 'Text', text: /\/quest-hud:sync/ })).toBeTruthy()
      await ui.unmount()
    }
  })

  test('off closes an open board, and leaves one that is not open alone', async ($, on) => {
    engine(on)
    await start($)
    world.panes = [{ id: 'quest-board', isShown: true }]
    await run($, 'quest-hud:off')
    expect(world.closed).toContain('quest-board')
    await run($, 'quest-hud:on')
    expect(world.opened).not.toContain('quest-board')
  })
})
