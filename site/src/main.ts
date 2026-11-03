// The page: settings and session controls over a drawing of the mod.
import './engine'
import plugin from '../../plugins/quest-hud/.claude-plugin/plugin.json'
import { OPTIONS } from '../../plugins/quest-hud/src/help'
import * as S from './session'
import { drawAll, drawFrame, roadColumns, type Slots } from './view'

const root = document.documentElement

addEventListener('error', event => {
  root.dataset.error = event.message
})

const slotOf = (id: string): HTMLElement => {
  const found = document.getElementById(id)
  if (!found) throw new Error(`no #${id} on the page`)
  return found
}

const slots: Slots = {
  transcript: slotOf('transcript'),
  band: slotOf('band'),
  hint: slotOf('hint'),
  pane: slotOf('pane'),
  road: slotOf('road'),
  ruler: slotOf('ruler'),
}

/** The mod's ANIM_MS, four frames a second; a test keeps it in step, as register.tsx cannot be imported here. */
const ANIM_MS = 250
const isStill = matchMedia('(prefers-reduced-motion: reduce)').matches

let sim = S.exampleSession({ detail: 'pane', bars: 'hpmp', avatar: 'wizard', graphics: 'auto', zones: '' }, Date.now(), isStill)

const redraw = (): void => drawAll(sim, slots, Date.now())

// One timer at most, and only while the mod's own rule asks for one.
let timer: ReturnType<typeof setInterval> | undefined

const syncTimer = (): void => {
  const needed = S.needsTimer(sim)

  if (needed && timer === undefined) {
    timer = setInterval(() => {
      sim = S.tickSim(sim)
      drawFrame(sim, slots)
      syncTimer()
    }, ANIM_MS)
  } else if (!needed && timer !== undefined) {
    clearInterval(timer)
    timer = undefined
    drawFrame(sim, slots)
  }
}

const act = (event: (current: S.Sim, now: number) => S.Sim): void => {
  sim = event(sim, Date.now())
  redraw()
  syncControls()
  syncTimer()
}

// Settings: built from the mod's own option list, with its own words for them.

type OptionName = keyof S.Settings
const CONFIG = plugin.userConfig as Readonly<Record<string, { title: string; description: string }>>
const settingNote = slotOf('setting-note')

const describe = (name: string): void => {
  settingNote.textContent = CONFIG[name]?.description ?? ''
}

const buildSettings = (): void => {
  const box = slotOf('settings')

  for (const option of OPTIONS) {
    const name = option.name as OptionName
    const group = document.createElement('fieldset')
    group.className = 'setting'
    const legend = document.createElement('legend')
    legend.textContent = CONFIG[name]?.title ?? name
    group.append(legend)

    if (option.values.length === 0) {
      const input = document.createElement('input')
      input.type = 'text'
      input.id = 'zones'
      input.placeholder = 'deploy=harbour'
      input.spellcheck = false
      input.autocomplete = 'off'
      input.setAttribute('aria-label', 'Zone overrides')
      input.addEventListener('input', () => act(current => S.withSetting(current, 'zones', input.value)))
      input.addEventListener('focus', () => describe(name))
      group.append(input)
    } else {
      const choices = document.createElement('div')
      choices.className = 'choices'

      for (const value of option.values) {
        const label = document.createElement('label')
        const input = document.createElement('input')
        input.type = 'radio'
        input.name = name
        input.value = value
        input.checked = sim.settings[name] === value
        input.addEventListener('change', () => {
          describe(name)
          act(current => S.withSetting(current, name, value as never))
        })
        const word = document.createElement('span')
        word.textContent = value
        label.append(input, word)
        choices.append(label)
      }

      group.append(choices)
    }

    box.append(group)
  }
}

// The session's controls.

type Range = { id: string; value: () => number; set: (current: S.Sim, value: number) => S.Sim; shown: () => string }

const RANGES: readonly Range[] = [
  { id: 'hp', value: () => sim.hp, set: S.withHp, shown: () => `${sim.hp}%` },
  { id: 'mp', value: () => sim.mp, set: S.withMp, shown: () => `${sim.mp}%` },
  { id: 'five', value: () => sim.five, set: S.withFive, shown: () => `${sim.five}%` },
  { id: 'cost', value: () => sim.cost, set: S.withCost, shown: () => `$${sim.cost.toFixed(2)}` },
]

const bindRanges = (): void => {
  for (const range of RANGES) {
    const input = slotOf(range.id) as HTMLInputElement
    input.addEventListener('input', () => act(current => range.set(current, Number(input.value))))
  }
}

const syncControls = (): void => {
  for (const range of RANGES) {
    (slotOf(range.id) as HTMLInputElement).value = String(range.value())
    slotOf(`${range.id}-value`).textContent = range.shown()
  }
  slotOf('extra-bars').hidden = sim.settings.bars !== 'all'
  const working = slotOf('working')
  working.setAttribute('aria-pressed', String(sim.isWorking))
  working.textContent = sim.isWorking ? 'Claude is working' : 'Claude is idle'
}

/** How long a run's fight lasts on the page, so the strike can be seen. */
const FIGHT_MS = 1600

const run = (command: string, stdout: string, isError: boolean, line: string): void => {
  act(current => S.say(S.bashStart(current, command), `$ ${command}`))
  setTimeout(() => act((current, now) => S.say(S.bashEnd(current, command, stdout, isError, now), line)), FIGHT_MS)
}

const ACTIONS: Readonly<Record<string, () => void>> = {
  working: () => act(current => S.setWorking(current, !current.isWorking)),
  'next-task': () => act((current, now) => S.nextTask(current.tasks.some(t => t.status !== 'completed') ? current : S.addTask(current, `Another task (${current.tasks.length + 1})`), now)),
  'test-fail': () => run('npm test', '231 pass\n1 fail', true, '231 pass, 1 fail'),
  'test-pass': () => run('npm test', '232 pass\n0 fail', false, '232 pass, 0 fail'),
  'lint-fail': () => run('npx eslint .', '1 problem (1 error, 0 warnings)', true, '1 problem'),
  'lint-pass': () => run('npx eslint .', '', false, 'lint is clean'),
  commit: () => run('git commit -m "Write the CSV writer tests"', `[main ${Math.random().toString(16).slice(2, 9)}] Write the CSV writer tests\n 1 file changed`, false, '1 file changed'),
  gh: () => run('gh pr view 42', '', false, 'read pull request 42'),
  glab: () => run('glab mr view 42', '', false, 'read merge request 42'),
  read: () => act((current, now) => S.say(S.toolCall(current, 'Read', { file_path: '/repo/src/export.ts' }, {}, now), 'Read src/export.ts')),
  edit: () => act((current, now) => S.say(S.toolCall(current, 'Edit', { file_path: '/repo/src/export.ts' }, {}, now), 'Edited src/export.ts')),
  'add-agent': () => act(current => S.addCompanion(current, 'Explore')),
  'drop-agent': () => act(S.dropCompanion),
  compact: () => act((current, now) => S.say(S.compact(current, 18, now), 'Compacted the conversation.')),
  'end-skill': () => act(S.endSkill),
}

const bindActions = (): void => {
  for (const [id, action] of Object.entries(ACTIONS)) slotOf(id).addEventListener('click', action)

  const skill = slotOf('skill-form') as HTMLFormElement
  skill.addEventListener('submit', event => {
    event.preventDefault()
    const name = (slotOf('skill') as HTMLInputElement).value.trim()
    if (name !== '') act((current, now) => S.startSkill(current, name, now))
  })
}

// The Road re-lays out to the columns it has; only a change of whole columns redraws it.
let lastColumns = 0
new ResizeObserver(() => {
  const columns = roadColumns(slots)
  if (columns !== lastColumns && !slots.pane.hidden) {
    lastColumns = columns
    redraw()
  }
}).observe(slots.road)

buildSettings()
describe('detail')
bindRanges()
bindActions()
redraw()
syncControls()
root.dataset.ready = 'yes'
