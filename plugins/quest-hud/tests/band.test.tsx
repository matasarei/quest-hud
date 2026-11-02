import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { artCells } from '../hooks/pane'
import { QUADRANT, quadrantWords } from '../src/avatar'
import { OPTIONS } from '../src/help'
import { downsample } from '../src/paint/pixels'
import { bandPortrait } from '../src/scene'

// The session id the engine answers; a test changes it to stand for /clear.
const session = { id: 's1', rateLimits: [] as Array<{ kind: string; percentUsed: number; resetsAt?: string }> }
// The names the plugin registered, as the engine was asked.
const registered: string[] = []

// Nothing sits beneath the plugin in a test: these hooks stand for the engine.
const engine = (on: On, statuses: Array<string | undefined> = [], store: Readonly<Record<string, unknown>> = {}) => {
  session.id = 's1'
  session.rateLimits = []
  registered.length = 0
  mock.clock(on, { now: Date.parse('2026-11-01T10:00:00Z') })
  mock.store(on, store)
  on('command.register', (_, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('session.id', () => ({ value: session.id }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000 }, rateLimits: session.rateLimits } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', (_, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  on('tool.call', (_, e) =>
    e.tool === 'TaskCreate' ? { result: { task: { id: `t-${e.subject}`, subject: e.subject } } } : { result: { success: true } },
  )
  // Beneath the plugin, the hint line shows what it was handed, so a test can read it.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.component === 'PromptHint' ? JSON.stringify({ hint: e.props.hint, tail: e.props.tail ?? null }) : 'engine below'}</Text>
  })
}

// What command.run carries beside the command: where it came from, and the screen.
const RUN = { origin: { kind: 'sdk' }, presentation: { isFullscreen: false, columns: 120 } } as const

const SUBSCRIBER = {
  context: { tokens: 82_000, window: 200_000, percent: 41 },
  rateLimits: [{ kind: 'seven_day', percentUsed: 38, resetsAt: '2026-11-03T14:00:00Z' }],
  cost: { usd: 1.84 },
  changed: ['context' as const],
}

const implementWithTasks = async ($: Engine) => {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.skill.prompt({ skill: 'implement', pluginName: 'gku', text: 'Build it.', frontmatter: { description: 'Build a task step by step' } })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Read the exporter', description: '' })
  await $.tool.call({ tool: 'TaskCreate', subject: 'Write the tests', description: '' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: 't-Write the tests', status: 'in_progress' })
  await $.session.measure(SUBSCRIBER)
}

const band = (surface: 'terminal' | 'desktop', maxRows = 6) => ({
  plugin: 'quest-hud',
  component: 'AbovePrompt',
  surface,
  props: { hasSurvey: false, isWorking: false, maxRows, bodyColumns: 140, scroll: { offset: 0, bodyRows: maxRows }, view: {} },
}) as const

describe('the band', () => {
  for (const surface of ['terminal', 'desktop'] as const) {
    test(`shows the skill, its zone, the task and both bars on ${surface}`, async ($, on) => {
      engine(on)
      await implementWithTasks($)
      const ui = await $.ui.mount(band(surface))

      expect((await ui.find({ type: 'Text', text: /⚔ gku:implement/ }))?.text).toBe('⚔ gku:implement')
      expect(await ui.find({ type: 'Text', text: /Forge/ })).toBeTruthy()
      expect((await ui.find({ type: 'Text', text: /task \d\/\d/ }))?.text).toBe('  task 0/2')
      expect((await ui.find({ type: 'Text', text: /Write the tests/ }))?.text).toBe(' · Write the tests')
      expect((await ui.find({ type: 'Text', text: /^ 62%$/ }))?.text).toBe(' 62%')
      expect((await ui.find({ type: 'Text', text: /^ 59%$/ }))?.text).toBe(' 59%')
      expect(await ui.find({ type: 'Text', text: /engine below/ })).toBeTruthy()
      await ui.unmount()
    })
  }

  test('draws the wizard\'s portrait: a 10 × 3 Raster on the terminal, an Svg on the desktop', async ($, on) => {
    engine(on)
    await implementWithTasks($)
    const terminal = await $.ui.mount(band('terminal'))
    const raster = await terminal.find({ type: 'Raster' })
    expect([raster?.props.columns, raster?.props.rows]).toEqual([10, 3])
    // In quadrants, from the 20 × 12 art, at rest or casting.
    expect([artCells(bandPortrait('stand')), artCells(bandPortrait('walk1'))]).toContain(String(raster?.props.cells))
    const points = quadrantWords(downsample(bandPortrait(), 1, 2)).filter((_, i) => i % 3 === 0)
    expect(points).toHaveLength(10 * 3)
    expect(points.every(cp => QUADRANT.includes(cp))).toBe(true)
    await terminal.unmount()
    const desktop = await $.ui.mount(band('desktop'))
    expect(await desktop.find({ type: 'Svg' })).toBeTruthy()
    await desktop.unmount()
  })

  test('leaves the avatar out when the slot has fewer rows than it needs', async ($, on) => {
    engine(on)
    await implementWithTasks($)
    const ui = await $.ui.mount(band('terminal', 2))
    expect(await ui.find({ type: 'Raster' })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /gku:implement/ })).toBeTruthy()
    await ui.unmount()
  })

  test('before any skill runs, the band shows the Wilds and the bars', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const early = await $.ui.mount(band('terminal'))
    expect(await early.find({ type: 'Text', text: /⚔/ })).toBeFalsy()
    expect((await early.find({ type: 'Text', text: /Wilds/ }))?.text).toBe('Wilds')
    expect(await early.find({ type: 'Text', text: /MP/ })).toBeTruthy()
    expect(await early.find({ type: 'Text', text: /engine below/ })).toBeTruthy()
    await early.unmount()
  })

  test('draws nothing of its own while a survey is up', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.skill.prompt({ skill: 'plan', text: 'x' })
    const survey = await $.ui.mount({ ...band('terminal'), props: { ...band('terminal').props, hasSurvey: true } })
    expect(await survey.find({ type: 'Text', text: /⚔|Wilds|MP/ })).toBeFalsy()
    expect(await survey.find({ type: 'Text', text: /engine below/ })).toBeTruthy()
    await survey.unmount()
  })

  test('with no rate-limit windows there is no HP, and MP is full until a measure', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.skill.prompt({ skill: 'plan', text: 'x' })
    const ui = await $.ui.mount(band('terminal'))
    expect(await ui.find({ type: 'Text', text: /HP/ })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /^—$/ })).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /^ 100%$/ }))?.text).toBe(' 100%')
    await ui.unmount()
  })

  // A /clear wipes the host's state, and neither session.start nor session.measure follows:
  // the plugin's values are their initial ones while the engine still has the figures.
  test('after a /clear, HP comes back from the engine with nothing fired, and MP is full', async ($, on) => {
    engine(on)
    session.rateLimits = SUBSCRIBER.rateLimits
    const ui = await $.ui.mount(band('terminal'))
    expect((await ui.find({ type: 'Text', text: /^♥ HP/ }))?.text).toBe('♥ HP ')
    expect(await ui.find({ type: 'Text', text: / 62%$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^—$/ })).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /^ 100%$/ }))?.text).toBe(' 100%')
    await ui.unmount()
  })

  test('after a /clear, /quest-hud:status answers from the engine too', async ($, on) => {
    engine(on)
    session.rateLimits = SUBSCRIBER.rateLimits
    const { text } = await $.command.run({ command: 'quest-hud:status', args: '', ...RUN })
    expect(text?.split('\n')[0]).toBe('♥▰▰▰▰▰▰▱▱▱▱ 62% ✦▰▰▰▰▰▰▰▰▰▰ 100%')
  })

  test('a subagent\'s task list is not the session\'s', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.skill.prompt({ skill: 'plan', text: 'x' })
    await $.tool.call({ tool: 'TaskCreate', subject: 'Theirs', description: '', agentId: 'a1' })
    const ui = await $.ui.mount(band('terminal'))
    expect(await ui.find({ type: 'Text', text: /task/ })).toBeFalsy()
    await ui.unmount()
  })
})

describe('what the HUD leaves unchanged', () => {
  test('the skill text the model reads is the text the engine computed', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const result = await $.skill.prompt({ skill: 'plan', text: 'Exactly this.' })
    expect(result).toEqual({ text: 'Exactly this.' })
  })
})

describe('the hint line', () => {
  const hint = (tail?: string) => ({
    plugin: 'quest-hud',
    component: 'PromptHint',
    surface: 'terminal',
    props: { isDraft: false, isWorking: false, hint: '? for shortcuts', ...(tail === undefined ? {} : { tail }) },
  }) as const

  const shows = async ($: Engine, text: RegExp, props = hint()): Promise<boolean> => {
    const ui = await $.ui.mount(props)
    const found = await ui.find({ type: 'Text', text })
    await ui.unmount()
    return Boolean(found)
  }

  test('detail = status: the bars before the quest in tail, and the hint untouched', { options: { detail: 'status' } }, async ($, on) => {
    engine(on)
    await implementWithTasks($)
    expect(await shows($, /^\{"hint":"\? for shortcuts","tail":"♥[▰▱]{10} 62% ✦[▰▱]{10} 59% ⚔ gku:implement 0\/2"\}$/)).toBe(true)
  })

  for (const detail of ['off', 'band', 'pane']) {
    test(`detail = ${detail}: tail stays as it came`, { options: { detail } }, async ($, on) => {
      engine(on)
      await implementWithTasks($)
      expect(await shows($, /"tail":null/)).toBe(true)
    })
  }

  test('detail = status while off: tail stays as it came', { options: { detail: 'status' } }, async ($, on) => {
    engine(on, [], { hidden: true })
    await implementWithTasks($)
    expect(await shows($, /"tail":null/)).toBe(true)
  })

  test('a tail another plugin set is kept, with ours after it', { options: { detail: 'status' } }, async ($, on) => {
    engine(on)
    await implementWithTasks($)
    expect(await shows($, /"tail":"theirs ♥/, hint('theirs'))).toBe(true)
  })

  test('tail follows a new measurement', { options: { detail: 'status' } }, async ($, on) => {
    engine(on)
    await implementWithTasks($)
    expect(await shows($, /✦[▰▱]{10} 59%/)).toBe(true)
    await $.session.measure({ ...SUBSCRIBER, context: { tokens: 20_000, window: 200_000, percent: 10 } })
    expect(await shows($, /✦[▰▱]{10} 90%/)).toBe(true)
  })
})

describe('the detail option', () => {
  test('off: no band and no status', { options: { detail: 'off' } }, async ($, on) => {
    const statuses: Array<string | undefined> = []
    engine(on, statuses)
    await implementWithTasks($)
    const ui = await $.ui.mount(band('terminal'))
    expect(await ui.find({ type: 'Text', text: /⚔/ })).toBeFalsy()
    expect(statuses).toEqual([])
    await ui.unmount()
  })

  for (const detail of ['off', 'status', 'band', 'pane']) {
    test(`${detail}: no status entry, ever`, { options: { detail } }, async ($, on) => {
      const statuses: Array<string | undefined> = []
      engine(on, statuses)
      await implementWithTasks($)
      await $.session.measure(SUBSCRIBER)
      expect(statuses).toEqual([])
    })
  }

  test('status: no band', { options: { detail: 'status' } }, async ($, on) => {
    engine(on)
    await implementWithTasks($)
    const ui = await $.ui.mount(band('terminal'))
    expect(await ui.find({ type: 'Text', text: /⚔/ })).toBeFalsy()
    await ui.unmount()
  })
})

describe('/quest-hud:help and the options', () => {
  for (const option of OPTIONS.filter(o => o.values.length > 0)) {
    for (const value of [...option.values, 'nonsense']) {
      const expected = option.values.includes(value) ? value : option.fallback
      test(`${option.name} = ${value}: help says now ${expected}`, { options: { [option.name]: value } }, async ($, on) => {
        engine(on)
        await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
        const text = (await $.command.run({ command: 'quest-hud:help', args: '', ...RUN })).text ?? ''
        const line = text.split('\n').find(l => l.trimStart().startsWith(`${option.name} `)) ?? ''
        expect(line).toContain(`now ${expected} (default ${option.fallback})`)
      })
    }
  }

  test('/quest-hud answers the same list', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const text = (await $.command.run({ command: 'quest-hud:help', args: '', ...RUN })).text ?? ''
    expect(text).toBe((await $.command.run({ command: 'quest-hud', args: '', ...RUN })).text ?? '')
    expect(text).toContain('now band (default band)')
  })

  test('zones: the rules in force, or none', { options: { zones: 'quest=forge' } }, async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const text = (await $.command.run({ command: 'quest-hud:help', args: '', ...RUN })).text ?? ''
    expect(text).toContain('now quest=forge')
  })
})

describe('the /quest-hud: commands', () => {
  test('the session registers only /quest-hud', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    expect(registered).toEqual(['quest-hud'])
  })

  test('after a space, the same words give the same answers', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    for (const word of ['status', 'statusline', 'help']) {
      const spaced = await $.command.run({ command: 'quest-hud', args: word, ...RUN })
      const named = await $.command.run({ command: `quest-hud:${word}`, args: '', ...RUN })
      expect(spaced.text).toBe(named.text)
    }
  })

  test('statusline prints the copy command and the setting', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const result = await $.command.run({ command: 'quest-hud:statusline', args: '', ...RUN })
    expect(result.text).toContain('/scripts/hud-line.sh" ~/.claude/hud-line.sh')
    expect(result.text).toContain('"statusLine": { "type": "command", "command": "~/.claude/hud-line.sh" }')
  })

  test('task subjects are printed as one clean line each', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.tool.call({ tool: 'TaskCreate', subject: 'two\nlines \u202eevil', description: '' })
    const result = await $.command.run({ command: 'quest-hud:status', args: '', ...RUN })
    expect(result.text).toContain('· two lines evil')
    expect((result.text ?? '').split('\n')).toHaveLength(3)
  })

  test('help lists the commands and the options, with the values in force', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    for (const args of ['help', ' HELP ']) {
      const text = (await $.command.run({ command: 'quest-hud', args, ...RUN })).text ?? ''
      expect(text).toContain('/quest-hud:pane')
      expect(text).toContain('/quest-hud:statusline')
      expect(text).toContain('set with /plugin configure quest-hud@quest-hud')
      expect(text).toContain('now auto (default auto)')
    }
  })

  test('a word /quest-hud does not know says so, then the help', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const text = (await $.command.run({ command: 'quest-hud', args: 'pan', ...RUN })).text ?? ''
    expect(text.split('\n')[0]).toBe('No /quest-hud pan.')
    expect(text).toContain('/quest-hud:pane')
  })

  test('status prints the state and the task list', async ($, on) => {
    engine(on)
    await implementWithTasks($)
    const result = await $.command.run({ command: 'quest-hud:status', args: '', ...RUN })
    expect(result.text).toContain('⚔ gku:implement 0/2')
    expect(result.text).toContain('▸ Write the tests')
    expect(result.text).toContain('◉$1.84')
  })
})

describe('prompts', () => {
  const prompt = (text: string, kind: 'composer' | 'task-notification' | 'peer' | 'scheduled-trigger') =>
    ({ text, wait: false, origin: { kind } }) as const

  test('a prompt is never shown in the band', async ($, on) => {
    engine(on)
    on('prompt.submit', (_, e) => ({ text: e.text }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.prompt.submit(prompt('make the export handle empty departments', 'composer'))
    const ui = await $.ui.mount(band('terminal'))
    expect(await ui.find({ type: 'Text', text: /empty departments/ })).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /Wilds/ }))?.text).toBe('Wilds')
    await ui.unmount()
  })

  test('the person\'s next request ends a finished skill\'s quest', async ($, on) => {
    engine(on)
    on('prompt.submit', (_, e) => ({ text: e.text }))
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.skill.prompt({ skill: 'plan', text: 'x' })
    await $.prompt.submit(prompt('yes', 'composer'))
    const kept = await $.ui.mount(band('terminal'))
    expect((await kept.find({ type: 'Text', text: /⚔/ }))?.text).toBe('⚔ plan')
    await kept.unmount()
    await $.prompt.submit(prompt('now make the export handle empty departments', 'composer'))
    const ended = await $.ui.mount(band('terminal'))
    expect(await ended.find({ type: 'Text', text: /⚔/ })).toBeFalsy()
    expect((await ended.find({ type: 'Text', text: /Wilds/ }))?.text).toBe('Wilds')
    await ended.unmount()
  })

  for (const kind of ['task-notification', 'peer', 'scheduled-trigger'] as const) {
    test(`a ${kind} prompt never ends the quest`, async ($, on) => {
      engine(on)
      on('prompt.submit', (_, e) => ({ text: e.text }))
      await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
      await $.skill.prompt({ skill: 'plan', text: 'x' })
      await $.prompt.submit(prompt('Background task finished with three results', kind))
      const ui = await $.ui.mount(band('terminal'))
      expect((await ui.find({ type: 'Text', text: /⚔/ }))?.text).toBe('⚔ plan')
      await ui.unmount()
    })
  }
})

describe('session', () => {
  test('a reload (same session id) keeps the quest and the tasks', async ($, on) => {
    engine(on)
    await implementWithTasks($)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(band('terminal'))
    expect((await ui.find({ type: 'Text', text: /⚔/ }))?.text).toBe('⚔ gku:implement')
    expect((await ui.find({ type: 'Text', text: /task \d/ }))?.text).toBe('  task 0/2')
    await ui.unmount()
  })

  test('a new session id (/clear) starts the quest and the tasks over', async ($, on) => {
    engine(on)
    await implementWithTasks($)
    session.id = 's2'
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const ui = await $.ui.mount(band('terminal'))
    expect(await ui.find({ type: 'Text', text: /⚔/ })).toBeFalsy()
    expect(await ui.find({ type: 'Text', text: /task/ })).toBeFalsy()
    expect((await ui.find({ type: 'Text', text: /Wilds/ }))?.text).toBe('Wilds')
    await ui.unmount()
  })
})

describe('skills run by subagents', () => {
  // The engine runs a Skill call by expanding the skill: its skill.prompt
  // fires while the call is still open. The gate holds the call open in the
  // engine's place, so the test can raise the skill.prompt inside it.
  const heldSkillCall = (on: On) => {
    let entered = () => {}
    let release = () => {}
    const reached = new Promise<void>(resolve => (entered = resolve))
    const gate = new Promise<void>(resolve => (release = resolve))
    on('tool.call', { tool: 'Skill' }, async () => {
      entered()
      await gate
      return { result: { success: true } }
    })
    return { reached, release }
  }

  test('a subagent\'s skill does not become the quest', async ($, on) => {
    const held = heldSkillCall(on)
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.skill.prompt({ skill: 'implement', pluginName: 'gku', text: 'x', frontmatter: { description: 'Build a task' } })
    const call = $.tool.call({ tool: 'Skill', skill: 'review', agentId: 'a1' })
    await held.reached
    await $.skill.prompt({ skill: 'review', text: 'expanded' })
    held.release()
    await call
    const ui = await $.ui.mount(band('terminal'))
    expect((await ui.find({ type: 'Text', text: /⚔/ }))?.text).toBe('⚔ gku:implement')
    await ui.unmount()
  })

  test('once the subagent\'s call is over, the same skill run by the person sets the quest', async ($, on) => {
    const held = heldSkillCall(on)
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const call = $.tool.call({ tool: 'Skill', skill: 'review', agentId: 'a1' })
    await held.reached
    held.release()
    await call
    await $.skill.prompt({ skill: 'review', text: 'expanded' })
    const ui = await $.ui.mount(band('terminal'))
    expect((await ui.find({ type: 'Text', text: /⚔/ }))?.text).toBe('⚔ review')
    await ui.unmount()
  })
})

describe('/quest-hud:status says what the zone means', () => {
  test('a planning skill is the Map room, planning and research', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    await $.skill.prompt({ skill: 'plan', pluginName: 'gku', text: 'x', frontmatter: { description: 'Turn a request into a plan' } })
    const result = await $.command.run({ command: 'quest-hud:status', args: '', ...RUN })
    expect(result.text).toContain('  Map room — planning and research')
  })

  test('with no skill running, the Wilds', async ($, on) => {
    engine(on)
    await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
    const result = await $.command.run({ command: 'quest-hud:status', args: '', ...RUN })
    expect(result.text).toContain('  Wilds — no skill running')
  })
})
