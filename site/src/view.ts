// Draws a session with the mod's own models and layouts, into the page's slots.
import type { RenderInput } from 'claude-code'

import { drawBand } from '../../plugins/quest-hud/hooks/band'
import { bandModel, hintText } from '../../plugins/quest-hud/src/meters'
import { $, show } from './engine'
import { hasBand, hasHint, metersOf, type Sim } from './session'

export type Slots = Readonly<{
  transcript: HTMLElement
  band: HTMLElement
  hint: HTMLElement
}>

/** The engine's own words on the hint line, which a `status` detail adds to and never replaces. */
const ENGINE_HINT = '? for shortcuts'

const drawTranscript = (sim: Sim, slot: HTMLElement): void => {
  slot.textContent = sim.transcript.join('\n')
  slot.scrollTop = slot.scrollHeight
}

const drawBandSlot = (sim: Sim, slot: HTMLElement, now: number, pose: Parameters<typeof drawBand>[4]): void => {
  if (!hasBand(sim)) {
    slot.replaceChildren()
    return
  }

  const band = bandModel(sim.quest, sim.tasks, metersOf(sim, now), sim.settings.bars, now)
  show(slot, drawBand($, {} as RenderInput<'AbovePrompt'>, band, 'raster', pose, sim.settings.avatar))
}

const drawHint = (sim: Sim, slot: HTMLElement, now: number): void => {
  const tail = hasHint(sim) ? ` ${hintText(sim.quest, sim.tasks, metersOf(sim, now), sim.settings.bars)}` : ''
  slot.textContent = `${ENGINE_HINT}${tail}`
}

export const drawAll = (sim: Sim, slots: Slots, now: number): void => {
  drawTranscript(sim, slots.transcript)
  drawBandSlot(sim, slots.band, now, 'stand')
  drawHint(sim, slots.hint, now)
}
