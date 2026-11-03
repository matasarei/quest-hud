// The page: settings and session controls over a drawing of the mod.
import './engine'
import plugin from '../../plugins/quest-hud/.claude-plugin/plugin.json'
import { OPTIONS } from '../../plugins/quest-hud/src/help'
import { COMMANDS, postBoard, runCommand } from './commands'
import { SESSION } from './script'
import * as S from './session'
import { drawAll, drawFrame, roadColumns, type Slots } from './view'

const root = document.documentElement

// Anything that goes wrong is written where site/tests/smoke.sh reads it.
addEventListener('error', event => {
  root.dataset.error = event.message
})
addEventListener('unhandledrejection', event => {
  root.dataset.error = String(event.reason)
})
addEventListener('securitypolicyviolation', event => {
  root.dataset.error = `CSP blocked ${event.blockedURI} (${event.effectiveDirective})`
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
  board: slotOf('board'),
  roadTab: slotOf('road-tab'),
  boardTab: slotOf('board-tab'),
  paneExample: slotOf('pane-example'),
  statusLine: slotOf('status-line'),
  ruler: slotOf('ruler'),
}

/** The mod's ANIM_MS, four frames a second; a test keeps it in step, as register.tsx cannot be imported here. */
const ANIM_MS = 250
const isStill = matchMedia('(prefers-reduced-motion: reduce)').matches

let sim = S.exampleSession({ detail: 'pane', bars: 'hpmp', avatar: 'wizard', flavor: 'on', graphics: 'auto' }, Date.now(), isStill)

const redraw = (): void => drawAll(sim, slots, Date.now(), () => act(S.toggleTrivial))

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

  // Zones are left out: they take a skill's name, and the page runs no skill of the visitor's.
  for (const option of OPTIONS.filter(({ values }) => values.length > 0)) {
    const name = option.name as OptionName
    const group = document.createElement('fieldset')
    group.className = 'setting'
    const legend = document.createElement('legend')
    legend.textContent = CONFIG[name]?.title ?? name
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

    group.append(legend, choices)
    box.append(group)
  }
}

// The session's controls.

type Range = { id: string; value: () => number; set: (current: S.Sim, value: number) => S.Sim; shown: () => string }

const RANGES: readonly Range[] = [
  { id: 'hp', value: () => sim.hp, set: S.withHp, shown: () => `${sim.hp}%` },
  { id: 'mp', value: () => sim.mp, set: S.withMp, shown: () => `${sim.mp}%` },
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
  slotOf('graphics-note').hidden = sim.settings.graphics !== 'auto' || !S.isRoadShown(sim)
  slotOf('flag-note').hidden = !S.isRoadShown(sim)
}

// The herald's return, which a new session has no use for: Play cancels it.
const waiting = new Set<ReturnType<typeof setTimeout>>()

const later = (ms: number, then: () => void): void => {
  const timeout = setTimeout(() => {
    waiting.delete(timeout)
    then()
  }, ms)
  waiting.add(timeout)
}

const cancelWaiting = (): void => {
  for (const timeout of waiting) clearTimeout(timeout)
  waiting.clear()
}

/** How long the herald is out on the page. */
const HERALD_MS = 1200

const buildCommands = (): void => {
  const box = slotOf('commands')

  for (const command of COMMANDS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'command'
    button.textContent = command
    button.setAttribute('aria-label', `/quest-hud:${command}`)
    button.addEventListener('click', () => {
      act((current, now) => runCommand(current, command, now))
      if (command === 'quests' && !sim.isHidden) later(HERALD_MS, () => act(postBoard))
    })
    box.append(button)
  }

  slotOf('road-tab').addEventListener('click', () => act(current => S.showPane(current, 'road')))
  slotOf('board-tab').addEventListener('click', () => act(current => S.showPane(current, 'board')))
  slotOf('pane-close').addEventListener('click', () => act(S.closePane))
}

// Play a session: one beat at a time, until it ends or the visitor stops it.
let playing: ReturnType<typeof setTimeout> | undefined

const showPlaying = (): void => {
  const play = slotOf('play')
  play.textContent = playing === undefined ? 'Play a session' : 'Stop'
  play.setAttribute('aria-pressed', String(playing !== undefined))
}

const beatFrom = (index: number): void => {
  const beat = SESSION[index]

  if (beat === undefined) {
    playing = undefined
    showPlaying()
    return
  }

  act((current, now) => S.spend(beat.apply(current, now), Math.random))
  playing = setTimeout(() => beatFrom(index + 1), beat.wait)
}

const togglePlay = (): void => {
  if (playing !== undefined) {
    clearTimeout(playing)
    playing = undefined
    // A beat's fight has no answer coming now.
    act(current => S.setWorking(S.interruptFights(current), false))
  } else {
    cancelWaiting()
    sim = S.startSpending(S.startSim(sim.settings, sim.isStill), Math.random)
    beatFrom(0)
  }
  showPlaying()
}

// The Road re-lays out to the columns it has; only a change of whole columns redraws it.
let lastColumns = 0
new ResizeObserver(() => {
  const columns = roadColumns(slots)
  if (columns !== lastColumns && !slots.road.hidden) {
    lastColumns = columns
    // Next frame: a redraw inside this callback would resize what it observes.
    requestAnimationFrame(redraw)
  }
}).observe(slots.road)

const bindInstall = (): void => {
  const button = slotOf('copy-install')
  const command = slotOf('install-command') as HTMLInputElement

  button.addEventListener('click', () => {
    // Selected first, so a browser that refuses the clipboard still leaves it ready to copy by hand.
    command.select()
    const say = (word: string) => (): void => { button.textContent = word }
    if (navigator.clipboard) navigator.clipboard.writeText(command.value).then(say('Copied'), say('Selected'))
    else say('Selected')()
  })
}

buildSettings()
buildCommands()
bindInstall()
describe('detail')
bindRanges()
slotOf('play').addEventListener('click', togglePlay)
redraw()
syncControls()
showPlaying()
root.dataset.ready = 'yes'
