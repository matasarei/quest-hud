import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { engine, RUN, start, stateOf, world } from './kit'

const run = async ($: Engine, command: string, args = ''): Promise<string> =>
  (await $.command.run({ command, args, ...RUN })).text ?? ''

const band = {
  plugin: 'quest-hud',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 140, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

const showsBand = async ($: Engine): Promise<boolean> => {
  const ui = await $.ui.mount(band)
  const found = await ui.find({ type: 'Text', text: /♥|✦|Wilds/ })
  await ui.unmount()
  return Boolean(found)
}

describe('/quest-hud:off', () => {
  test('hides the band at once, and a new session stays off', async ($, on) => {
    engine(on)
    await start($)
    expect(await showsBand($)).toBe(true)
    expect(await run($, 'quest-hud:off')).toContain('off, in every session')
    expect(await showsBand($)).toBe(false)
    world.id = 's2'
    await start($)
    expect(await stateOf($, 'hidden')).toBe(true)
    expect(await showsBand($)).toBe(false)
  })

  test('closes an open Road, and on opens it again', async ($, on) => {
    engine(on)
    await start($)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await run($, 'quest-hud:off')
    expect(world.closed).toEqual(['quest-hud'])
    expect(world.opened).toEqual([])
    await run($, 'quest-hud:on')
    expect(world.opened).toEqual(['quest-hud'])
  })

  test('with no Road open, on opens none', async ($, on) => {
    engine(on)
    await start($)
    await run($, 'quest-hud:off')
    await run($, 'quest-hud:on')
    expect(world.opened).toEqual([])
  })

  test('on clears what off remembered: the next off and on start fresh', async ($, on) => {
    engine(on)
    await start($)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await run($, 'quest-hud:off')
    await run($, 'quest-hud:on')
    world.opened = []
    world.panes = []
    await run($, 'quest-hud:off')
    await run($, 'quest-hud:on')
    expect(world.opened).toEqual([])
  })

  test('twice says it already is, and changes nothing', async ($, on) => {
    engine(on)
    await start($)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await run($, 'quest-hud:off')
    expect(await run($, 'quest-hud:off')).toBe('Quest HUD is already off.')
    await run($, 'quest-hud:on')
    expect(world.opened).toEqual(['quest-hud'])
  })

  test('clears the status entry, and on draws it again', { options: { detail: 'status' } }, async ($, on) => {
    engine(on)
    await start($)
    const before = world.statuses.length
    await run($, 'quest-hud:off')
    expect(world.statuses.slice(before)).toEqual([undefined])
    await $.session.measure({ context: { window: 200_000, tokens: 10_000, percent: 5 }, rateLimits: [], changed: ['context'] })
    expect(world.statuses.slice(before)).toEqual([undefined])
    await run($, 'quest-hud:on')
    expect(typeof world.statuses.at(-1)).toBe('string')
  })

  test('the Road will not open while off, and says why', async ($, on) => {
    engine(on)
    await start($)
    await run($, 'quest-hud:off')
    expect(await run($, 'quest-hud:pane')).toContain('/quest-hud:on')
    expect(world.opened).toEqual([])
  })

  test('the hooks go on observing, so on shows what happened meanwhile', async ($, on) => {
    engine(on)
    await start($)
    await run($, 'quest-hud:off')
    await $.tool.call({ tool: 'TaskCreate', subject: 'Done while hidden', description: '' })
    await run($, 'quest-hud:on')
    expect(await run($, 'quest-hud:status')).toContain('Done while hidden')
  })

  test('status, help and statusline still answer while off', async ($, on) => {
    engine(on)
    await start($)
    await run($, 'quest-hud:off')
    expect(await run($, 'quest-hud:status')).toContain('Wilds')
    expect(await run($, 'quest-hud:help')).toContain('/quest-hud:off')
    expect(await run($, 'quest-hud:statusline')).toContain('hud-line.sh')
  })

  test('after a space, off and on do the same', async ($, on) => {
    engine(on)
    await start($)
    await run($, 'quest-hud', 'off')
    expect(await stateOf($, 'hidden')).toBe(true)
    await run($, 'quest-hud', 'on')
    expect(await stateOf($, 'hidden')).toBe(false)
  })
})

describe('a command whose hook fails', () => {
  test('passes on to the skill, whose text says the mod is not running', async ($, on) => {
    engine(on)
    await start($)
    world.failOpen = true
    expect(await run($, 'quest-hud:pane')).toBe('the skill ran')
  })
})

describe('a session started while off', () => {
  test('draws no band and no status entry', { options: { detail: 'status' } }, async ($, on) => {
    engine(on, { hidden: true })
    await start($)
    expect(world.statuses).toEqual([undefined])
  })

  for (const detail of ['band', 'pane']) {
    test(`detail = ${detail}: no band and no Road`, { options: { detail } }, async ($, on) => {
      engine(on, { hidden: true })
      await start($)
      expect(world.opened).toEqual([])
      expect(await showsBand($)).toBe(false)
    })
  }

  test('on brings it back; with detail = pane, the Road too', { options: { detail: 'pane' } }, async ($, on) => {
    engine(on, { hidden: true })
    await start($)
    expect(await run($, 'quest-hud:on')).toBe('Quest HUD is back.')
    expect(world.opened).toEqual(['quest-hud'])
    expect(await showsBand($)).toBe(true)
  })

  test('on with detail = off says the option still hides it', { options: { detail: 'off' } }, async ($, on) => {
    engine(on, { hidden: true })
    await start($)
    expect(await run($, 'quest-hud:on')).toContain('detail option')
  })

  test('on, when not off, says so', async ($, on) => {
    engine(on)
    await start($)
    expect(await run($, 'quest-hud:on')).toBe('Quest HUD is already on.')
  })
})
