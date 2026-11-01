import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { engine, RUN, start, world } from './kit'

const pane = (surface: 'terminal' | 'desktop', bodyColumns = 60) => ({
  plugin: 'quest-hud',
  component: 'Pane',
  requestId: 'quest-hud',
  surface,
  viewport: { columns: bodyColumns + 2, rows: 30 },
  props: {
    id: 'quest-hud',
    title: 'The Road',
    isFocused: false,
    bodyColumns,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
}) as const

const implementing = async ($: Engine) => {
  await start($)
  await $.skill.prompt({ skill: 'implement', pluginName: 'gku', text: 'x', frontmatter: { description: 'Build a task step by step' } })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Read the exporter', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write the tests', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 't-Read the exporter', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 't-Write the tests', status: 'in_progress' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/export/csv.ts', old_string: 'a', new_string: 'b' })
  await $.session.measure({
    context: { tokens: 86_000, window: 200_000, percent: 43 },
    rateLimits: [{ kind: 'seven_day', percentUsed: 20 }],
    changed: ['context'],
  })
}

describe('the Road pane', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`shows the zone, the scene, the tasks, the bars and the log on ${surface}`, async ($, on) => {
      engine(on)
      await implementing($)
      const ui = await $.ui.mount(pane(surface))

      expect((await ui.find({ type: 'Text', text: /⚔/ }))?.text).toBe('⚔ gku:implement · Forge — building and fixing')
      expect((await ui.find({ type: 'Text', text: /^task/ }))?.text).toBe('task 1/2')
      expect(await ui.find({ type: surface === 'terminal' ? 'Raster' : 'Svg' })).toBeTruthy()
      expect((await ui.find({ type: 'Text', text: /Read the exporter/ }))?.text).toBe('✓ Read the exporter')
      expect((await ui.find({ type: 'Text', text: /Write the tests/ }))?.text).toBe('▸ Write the tests')
      expect((await ui.find({ type: 'Text', text: /^♥/ }))?.text).toBe('♥ ████████░░ 80%   ')
      expect((await ui.find({ type: 'Text', text: /^✦/ }))?.text).toBe('✦ ██████░░░░ 57%')
      expect(await ui.find({ type: 'Text', text: /csv\.ts \+4 -7/ })).toBeTruthy()
      expect(await ui.find({ type: 'Text', text: /gku:implement · Forge$/ })).toBeTruthy()
      await ui.unmount()
    })
  }

  test('the terminal\'s scene is a Raster keyed scene, as wide as the body and 8 rows tall', async ($, on) => {
    engine(on)
    await implementing($)
    const ui = await $.ui.mount(pane('terminal', 60))
    const scene = await ui.find({ type: 'Raster', key: 'scene' })
    expect(scene).toBeTruthy()
    expect(scene?.props.columns).toBe(60)
    expect(scene?.props.rows).toBe(8)
    await ui.unmount()
  })

  test('before anything happened: the Wilds and the bars', async ($, on) => {
    engine(on)
    await start($)
    const ui = await $.ui.mount(pane('terminal'))
    expect((await ui.find({ type: 'Text', text: /Wilds/ }))?.text).toBe('Wilds — no skill running')
    expect(await ui.find({ type: 'Text', text: /✦/ })).toBeTruthy()
    await ui.unmount()
  })
})

describe('opening the pane', () => {
  test('/hud pane opens it', async ($, on) => {
    engine(on)
    await start($)
    const result = await $.command.run({ command: 'hud', args: 'pane', ...RUN })
    expect(world.opened).toEqual(['quest-hud'])
    expect(result.text).toBe('The Road is open.')
  })

  test('detail = pane opens it at the start of the session', { options: { detail: 'pane' } }, async ($, on) => {
    engine(on)
    await start($)
    expect(world.opened).toEqual(['quest-hud'])
  })

  test('detail = band never opens it by itself', async ($, on) => {
    engine(on)
    await start($)
    await $.skill.prompt({ skill: 'plan', text: 'x' })
    expect(world.opened).toEqual([])
  })
})
