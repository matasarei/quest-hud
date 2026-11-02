import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { imageScale, QUADRANT } from '../src/avatar'
import { sceneArt } from '../src/scene'
import { engine, RUN, start, world } from './kit'

// Tests about the cells scene (the Raster, its animation) ask for it: auto draws an image first.
const CELLS = { options: { graphics: 'cells' } } as const

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
      expect(await ui.find({ type: surface === 'terminal' ? 'Image' : 'Svg' })).toBeTruthy()
      expect((await ui.find({ type: 'Text', text: /Read the exporter/ }))?.text).toBe('✓ Read the exporter')
      expect((await ui.find({ type: 'Text', text: /Write the tests/ }))?.text).toBe('▸ Write the tests')
      expect((await ui.find({ type: 'Text', text: /^♥/ }))?.text).toBe('♥ ████████░░ 80%   ')
      expect((await ui.find({ type: 'Text', text: /^✦/ }))?.text).toBe('✦ ██████░░░░ 57%')
      expect(await ui.find({ type: 'Text', text: /csv\.ts \+4 -7/ })).toBeTruthy()
      expect(await ui.find({ type: 'Text', text: /gku:implement · Forge$/ })).toBeTruthy()
      await ui.unmount()
    })
  }

  test('the terminal\'s scene is a Raster keyed scene, as wide as the body and 14 rows tall', CELLS, async ($, on) => {
    engine(on)
    await implementing($)
    const ui = await $.ui.mount(pane('terminal', 60))
    const scene = await ui.find({ type: 'Raster', key: 'scene' })
    expect(scene).toBeTruthy()
    expect(scene?.props.columns).toBe(60)
    expect(scene?.props.rows).toBe(14)
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

describe('the animation', () => {
  const mainTurn = { text: 'go', turnId: 'turn-1' }
  const turnDone = { turnId: 'turn-1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' } as const

  test('four frames a second while Claude works, each a step further, then one at rest, then nothing', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    await $.turn.start(mainTurn)
    await clock.advance(1000)
    expect(world.blits).toHaveLength(4)
    expect(new Set(world.blits).size).toBe(4)
    await $.turn.complete(turnDone)
    expect(world.blits).toHaveLength(5)
    expect(world.blits[4] === world.blits[3]).toBe(false)
    await clock.advance(2000)
    expect(world.blits).toHaveLength(5)
    await ui.unmount()
  })

  test('none while the pane is not shown', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: false }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    await $.turn.start(mainTurn)
    await clock.advance(2000)
    expect(world.blits).toHaveLength(0)
    await ui.unmount()
  })

  test('none on the desktop, where the scene is an Svg', async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('desktop'))
    await $.turn.start(mainTurn)
    await clock.advance(2000)
    expect(world.blits).toHaveLength(0)
    await ui.unmount()
  })

  test('hiding the pane mid-turn stops it at the next step', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    await $.turn.start(mainTurn)
    await clock.advance(250)
    expect(world.blits).toHaveLength(1)
    world.panes = [{ id: 'quest-hud', isShown: false }]
    await clock.advance(2000)
    expect(world.blits).toHaveLength(1)
    await ui.unmount()
  })

  test('a subagent\'s turn neither starts nor stops it', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    await $.turn.start({ text: 'explore', turnId: 'sub-1', agentId: 'a1' })
    await clock.advance(1000)
    expect(world.blits).toHaveLength(0)
    await ui.unmount()
  })
})

describe('the animation and a new session', () => {
  test('a session start stops an animation that was running', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    await $.turn.start({ text: 'go', turnId: 'turn-1' })
    await clock.advance(250)
    expect(world.blits).toHaveLength(1)
    world.id = 's2'
    await start($)
    await clock.advance(2000)
    expect(world.blits).toHaveLength(1)
    await ui.unmount()
  })
})

describe('the animation and the first draw', () => {
  test('a turn that started before the pane was first drawn animates once it is drawn', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    await $.turn.start({ text: 'go', turnId: 'turn-1' })
    const ui = await $.ui.mount(pane('terminal'))
    await clock.advance(1000)
    expect(world.blits).toHaveLength(4)
    await ui.unmount()
  })
})

describe('images or cells', () => {
  const PROBE = 150

  test('graphics = cells: a Raster, and no probe', CELLS, async ($, on) => {
    const clock = engine(on)
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    expect(await ui.find({ type: 'Raster', key: 'scene' })).toBeTruthy()
    expect(await ui.find({ type: 'Image' })).toBeFalsy()
    await clock.advance(PROBE)
    expect(world.imageBlits).toBe(0)
    await ui.unmount()
  })

  test('graphics = images: an Image the size of the scene, and no probe', { options: { graphics: 'images' } }, async ($, on) => {
    const clock = engine(on)
    await implementing($)
    const ui = await $.ui.mount(pane('terminal', 60))
    const image = await ui.find({ type: 'Image', key: 'scene-image' })
    expect(image?.props.columns).toBe(60)
    expect(image?.props.rows).toBe(14)
    await clock.advance(PROBE)
    expect(world.imageBlits).toBe(0)
    await ui.unmount()
  })

  test('auto, the engine takes the probe: images stay', async ($, on) => {
    const clock = engine(on)
    await implementing($)
    const first = await $.ui.mount(pane('terminal'))
    expect(await first.find({ type: 'Image', key: 'scene-image' })).toBeTruthy()
    await clock.advance(PROBE)
    expect(world.imageBlits).toBe(1)
    expect(world.state.imagesWork).toBe(true)
    await first.unmount()
    const again = await $.ui.mount(pane('terminal'))
    expect(await again.find({ type: 'Image' })).toBeTruthy()
    await clock.advance(PROBE)
    expect(world.imageBlits).toBe(1)
    await again.unmount()
  })

  test('auto, the engine refuses the probe: cells from then on', async ($, on) => {
    const clock = engine(on)
    world.refuseImages = true
    await implementing($)
    const first = await $.ui.mount(pane('terminal'))
    await clock.advance(PROBE)
    expect(world.imageBlits).toBe(1)
    expect(world.state.imagesWork).toBe(false)
    await first.unmount()
    const again = await $.ui.mount(pane('terminal'))
    expect(await again.find({ type: 'Raster', key: 'scene' })).toBeTruthy()
    expect(await again.find({ type: 'Image' })).toBeFalsy()
    await again.unmount()
  })

  test('a new session id forgets the answer, and probes again', async ($, on) => {
    const clock = engine(on)
    world.refuseImages = true
    await implementing($)
    const first = await $.ui.mount(pane('terminal'))
    await clock.advance(PROBE)
    await first.unmount()
    world.id = 's2'
    await start($)
    expect(world.state.imagesWork).toBe(null)
    const again = await $.ui.mount(pane('terminal'))
    expect(await again.find({ type: 'Image' })).toBeTruthy()
    await again.unmount()
  })

  test('an image scene animates too, as PNG frames, and comes to rest', { options: { graphics: 'images' } }, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    await $.turn.start({ text: 'go', turnId: 'turn-1' })
    await clock.advance(1000)
    expect(world.blits).toHaveLength(0)
    expect(world.imageBlits).toBe(4)
    await $.turn.complete({ turnId: 'turn-1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
    await clock.advance(2000)
    expect(world.imageBlits).toBe(5)
    await ui.unmount()
  })

  test('the desktop draws an Svg and never probes; at 200 columns it stays under the Svg cap', async ($, on) => {
    const clock = engine(on)
    await implementing($)
    const ui = await $.ui.mount(pane('desktop', 200))
    const svg = await ui.find({ type: 'Svg' })
    expect(typeof svg?.props.source).toBe('string')
    expect(String(svg?.props.source).length < 131_072).toBe(true)
    await clock.advance(PROBE)
    expect(world.imageBlits).toBe(0)
    await ui.unmount()
  })
})

describe('the probe and a new session', () => {
  test('a new session cancels the previous session\'s probe that has not fired yet', async ($, on) => {
    const clock = engine(on)
    world.refuseImages = true
    await implementing($)
    const first = await $.ui.mount(pane('terminal'))
    world.id = 's2'
    await start($)
    await first.unmount()
    await clock.advance(150)
    expect(world.imageBlits).toBe(0)
    expect(world.state.imagesWork).toBe(null)
  })
})

describe('the monsters on the Road', () => {
  const lose = async ($: Engine) => {
    world.bash = { error: 'Exit code 1\n 231 pass\n 1 fail' }
    await $.tool.call({ tool: 'Bash', command: 'claude plugin test plugins/quest-hud', description: '' })
  }

  test('a lost test run puts the Forge\'s golem on the desktop scene, and a passing one takes it away', async ($, on) => {
    engine(on)
    await implementing($)
    const svg = async () => {
      const ui = await $.ui.mount(pane('desktop', 120))
      const source = String((await ui.find({ type: 'Svg' }))?.props.source)
      await ui.unmount()
      return source
    }
    // The golem's glowing core: the Forge's test monster, where outdoors it is the dragon.
    expect((await svg()).includes('#ffe08a')).toBe(false)
    await lose($)
    expect((await svg()).includes('#ffe08a')).toBe(true)
    world.bash = { stdout: ' 232 pass\n 0 fail\n' }
    await $.tool.call({ tool: 'Bash', command: 'claude plugin test plugins/quest-hud', description: '' })
    expect((await svg()).includes('#ffe08a')).toBe(false)
  })

  const drawn = async ($: Engine, find: { type: 'Raster' | 'Image'; key: string }) => {
    const ui = await $.ui.mount(pane('terminal', 60))
    const found = await ui.find(find)
    await ui.unmount()
    return JSON.stringify(found?.props)
  }

  test('the cells change with it', CELLS, async ($, on) => {
    engine(on)
    await implementing($)
    const before = await drawn($, { type: 'Raster', key: 'scene' })
    await lose($)
    const after = await drawn($, { type: 'Raster', key: 'scene' })
    expect(before.includes('"cells"') && after.includes('"cells"')).toBe(true)
    expect(after).not.toBe(before)
  })

  test('the image changes with it', { options: { graphics: 'images' } }, async ($, on) => {
    engine(on)
    await implementing($)
    const before = await drawn($, { type: 'Image', key: 'scene-image' })
    await lose($)
    const after = await drawn($, { type: 'Image', key: 'scene-image' })
    expect(before.includes('"source"') && after.includes('"source"')).toBe(true)
    expect(after).not.toBe(before)
  })

  test('at 200 columns with everything up, the desktop Svg stays under the cap', async ($, on) => {
    engine(on)
    await implementing($)
    await lose($)
    world.bash = { error: 'Exit code 1' }
    await $.tool.call({ tool: 'Bash', command: 'npx eslint .', description: '' })
    world.bash = { stdout: '[main 2af33ea] x' }
    await $.tool.call({ tool: 'Bash', command: 'git commit -m x && gh pr view && glab mr view', description: '' })
    expect(world.state.allies).toEqual({ octopus: true, fox: true })
    expect(world.state.loot).toBe(1)
    const ui = await $.ui.mount(pane('desktop', 200))
    expect(String((await ui.find({ type: 'Svg' }))?.props.source).length < 131_072).toBe(true)
    await ui.unmount()
  })
})

describe('a pane too narrow for the scene', () => {
  test('no scene at all, on any surface', async ($, on) => {
    engine(on)
    await implementing($)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount(pane(surface, 30))
      expect(await ui.find({ type: 'Image' })).toBeFalsy()
      expect(await ui.find({ type: 'Raster' })).toBeFalsy()
      expect(await ui.find({ type: 'Svg' })).toBeFalsy()
      await ui.unmount()
    }
  })

  test('no probe in auto', async ($, on) => {
    const clock = engine(on)
    await implementing($)
    const ui = await $.ui.mount(pane('terminal', 30))
    await clock.advance(150)
    expect(world.imageBlits).toBe(0)
    expect(world.state.imagesWork).toBe(null)
    await ui.unmount()
  })

  test('no animation in cells while Claude works', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal', 30))
    await $.turn.start({ text: 'go', turnId: 'turn-1' })
    await clock.advance(1000)
    expect(world.blits).toEqual([])
    await ui.unmount()
  })
})

describe('a zone change', () => {
  const review = { skill: 'review', pluginName: 'gku', text: 'x', frontmatter: { description: 'Review a change' } }

  test('a skill start while Claude is idle slides the new zone in over six frames, then stops', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    await $.skill.prompt(review)
    await clock.advance(2000)
    expect(world.blits).toHaveLength(6)
    expect(world.blits.every((frame, i) => i === 0 || frame !== world.blits[i - 1])).toBe(true)
    await clock.advance(2000)
    expect(world.blits).toHaveLength(6)
    await ui.unmount()
  })

  test('the desktop never slides: its Svg is drawn still', async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const desktop = await $.ui.mount(pane('desktop'))
    await $.skill.prompt(review)
    await clock.advance(2000)
    expect(world.blits).toHaveLength(0)
    expect(world.imageBlits).toBe(0)
    await desktop.unmount()
  })

  test('as an image too', { options: { graphics: 'images' } }, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const ui = await $.ui.mount(pane('terminal'))
    await $.skill.prompt(review)
    await clock.advance(2000)
    expect(world.imageBlits).toBe(6)
    await ui.unmount()
  })
})

describe('the band\'s wizard', () => {
  const band = { plugin: 'quest-hud', component: 'AbovePrompt', surface: 'terminal', props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 140, scroll: { offset: 0, bodyRows: 6 }, view: {} } } as const

  test('steps with the Road\'s animation while Claude works, and comes to rest with it', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const road = await $.ui.mount(pane('terminal'))
    const portrait = await $.ui.mount(band)
    await $.turn.start({ text: 'go', turnId: 'turn-1' })
    await clock.advance(1000)
    expect(world.bandBlits).toHaveLength(4)
    expect(new Set(world.bandBlits).size > 1).toBe(true)
    await $.turn.complete({ turnId: 'turn-1', answer: '', durationMs: 1, isAborted: false, reason: 'answer' })
    expect(world.bandBlits).toHaveLength(5)
    await clock.advance(2000)
    expect(world.bandBlits).toHaveLength(5)
    await portrait.unmount()
    await road.unmount()
  })
})

describe('the image\'s detail', () => {
  /** A PNG's width and height, read from its header in the base64. */
  const pngSize = (base64: string): [number, number] => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const bits = [...base64.slice(0, 32)].map(c => alphabet.indexOf(c).toString(2).padStart(6, '0')).join('')
    const byte = (i: number) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)
    const word = (i: number) => ((byte(i) << 24) | (byte(i + 1) << 16) | (byte(i + 2) << 8) | byte(i + 3)) >>> 0
    return [word(16), word(20)]
  }

  test('an image shows the art\'s own pixels, twice the cells\' each way', { options: { graphics: 'images' } }, async ($, on) => {
    engine(on)
    await implementing($)
    const ui = await $.ui.mount(pane('terminal', 60))
    const image = await ui.find({ type: 'Image', key: 'scene-image' })
    const source: unknown = image?.props.source
    const png = typeof source === 'object' && source !== null && 'png' in source ? String(source.png) : ''
    const [width, height] = pngSize(png)
    // 60 columns and 28 pixel rows at the art's 2 a unit, 120 × 56, each art pixel a square of the image's scale.
    const scale = imageScale(120, 56)
    expect([width, height]).toEqual([120 * scale, 56 * scale])
    await ui.unmount()
  })
})

describe('a zone change while the pane is hidden', () => {
  /** The colour of a Raster's top-left pixel: its first cell's foreground, read from the base64 words. */
  const topLeft = (cells: string): number => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const bits = [...cells.slice(0, 16)].map(c => alphabet.indexOf(c).toString(2).padStart(6, '0')).join('')
    const byte = (i: number) => parseInt(bits.slice(i * 8, i * 8 + 8), 2)
    return byte(4) | (byte(5) << 8) | (byte(6) << 16)
  }

  test('shows the new zone when the pane is shown again, not a slide stuck at its start', CELLS, async ($, on) => {
    engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await implementing($)
    const before = await $.ui.mount(pane('terminal'))
    await before.unmount()
    world.panes = [{ id: 'quest-hud', isShown: false }]
    await $.skill.prompt({ skill: 'review', pluginName: 'gku', text: 'x', frontmatter: { description: 'Review a change' } })
    world.panes = [{ id: 'quest-hud', isShown: true }]
    const after = await $.ui.mount(pane('terminal'))
    const raster = await after.find({ type: 'Raster', key: 'scene' })
    // A quadrant cell's ink is its top-left pixel at the art's resolution: the zone's sky there.
    const sky = (zone: 'arena' | 'forge') => sceneArt({ columns: 4, zone, waypoints: [], companions: 0 })[0]?.[0]
    expect(topLeft(String(raster?.props.cells))).toBe(sky('arena'))
    expect(topLeft(String(raster?.props.cells)) === sky('forge')).toBe(false)
    await after.unmount()
  })
})

describe('the Road\'s text cells', () => {
  /** The cells' little-endian u32 words, three a cell: code point, ink, paper. */
  const words = (cells: string): number[] => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const clean = cells.replace(/=+$/, '')
    const bits = [...clean].map(c => alphabet.indexOf(c).toString(2).padStart(6, '0')).join('')
    const bytes = Array.from({ length: Math.floor(bits.length / 8) }, (_, i) => parseInt(bits.slice(i * 8, i * 8 + 8), 2))
    return Array.from({ length: Math.floor(bytes.length / 4) }, (_, i) => (bytes[i * 4]! | (bytes[i * 4 + 1]! << 8) | (bytes[i * 4 + 2]! << 16) | (bytes[i * 4 + 3]! << 24)) >>> 0)
  }
  /** Every cell's code point. */
  const codePoints = (cells: string): number[] => words(cells).filter((_, i) => i % 3 === 0)
  /** The pixels the cells show, two by two a cell: a quadrant's bit is its ink, else its paper. */
  const pixels = (cells: string, columns: number): number[][] => {
    const w = words(cells)
    const rows = Math.floor(w.length / 3 / columns)
    return Array.from({ length: rows * 2 }, (_, y) => Array.from({ length: columns * 2 }, (_, x) => {
      const i = (Math.floor(y / 2) * columns + Math.floor(x / 2)) * 3
      const bit = 1 << ((y % 2) * 2 + (x % 2))
      return (QUADRANT.indexOf(w[i]!) & bit) !== 0 ? w[i + 1]! : w[i + 2]!
    }))
  }
  /** Of the pixels that differ from their right neighbour, the share that match the one below: vertical stripes. */
  const striping = (grid: number[][]): number => {
    let mixed = 0
    let striped = 0
    for (let y = 0; y + 1 < grid.length; y++) {
      for (let x = 0; x + 1 < (grid[y]?.length ?? 0); x++) {
        if (grid[y]![x] === grid[y]![x + 1]) continue
        mixed++
        if (grid[y]![x] === grid[y + 1]![x]) striped++
      }
    }
    return striped / Math.max(1, mixed)
  }

  test('a dithered sky shows no vertical stripes, drawn or blitted', CELLS, async ($, on) => {
    const clock = engine(on)
    world.panes = [{ id: 'quest-hud', isShown: true }]
    await start($)
    const ui = await $.ui.mount(pane('terminal', 60))
    const raster = await ui.find({ type: 'Raster', key: 'scene' })
    // The sky: the top four cell rows, where nothing stands.
    const drawn = pixels(String(raster?.props.cells), 60).slice(0, 8)
    expect(new Set(drawn.flat()).size).toBeGreaterThan(1)
    expect(striping(drawn)).toBeLessThan(0.4)
    await $.turn.start({ text: 'go', turnId: 'turn-1' })
    await clock.advance(250)
    expect(world.blits.length).toBeGreaterThan(0)
    expect(striping(pixels(world.blits[0]!, 60).slice(0, 8))).toBeLessThan(0.4)
    await ui.unmount()
  })

  test('are quadrants, two by two pixels a cell, every one a BMP character', CELLS, async ($, on) => {
    engine(on)
    await implementing($)
    const ui = await $.ui.mount(pane('terminal', 60))
    const raster = await ui.find({ type: 'Raster', key: 'scene' })
    const points = codePoints(String(raster?.props.cells))
    expect(points).toHaveLength(60 * 14)
    expect(points.every(cp => QUADRANT.includes(cp))).toBe(true)
    // Not all half blocks: the art's finer columns show.
    expect(points.some(cp => cp !== 0x2580 && cp !== 0x2584 && cp !== 0x20 && cp !== 0x2588)).toBe(true)
    await ui.unmount()
  })
})
