// Draws a session with the mod's own models and layouts, into the page's slots.
import type { RenderInput } from 'claude-code'

import { BAND_KEY, drawBand } from '../../plugins/quest-hud/hooks/band'
import { artCells, drawRoad, SCENE_IMAGE_KEY, SCENE_KEY, sceneImage, type SceneMode } from '../../plugins/quest-hud/hooks/pane'
import { bandModel, hintText } from '../../plugins/quest-hud/src/meters'
import { road, roadArt, SCENE_MIN_COLUMNS } from '../../plugins/quest-hud/src/road'
import { bandPortrait } from '../../plugins/quest-hud/src/scene'
import { $, blit, show } from './engine'
import { hasBand, hasHint, isRoadShown, metersOf, transitionOf, type Sim } from './session'

export type Slots = Readonly<{
  transcript: HTMLElement
  band: HTMLElement
  hint: HTMLElement
  pane: HTMLElement
  road: HTMLElement
  /** A run of zeros in the terminal's font, measured for the width of a cell. */
  ruler: HTMLElement
}>

/** What the pane is given to lay out in: its rows are the mod's to share out, and the page lets it grow. */
const ROAD_ROWS = 30
const RULER_CHARACTERS = 100

/** The engine's own words on the hint line, which a `status` detail adds to and never replaces. */
const ENGINE_HINT = '? for shortcuts'

const drawTranscript = (sim: Sim, slot: HTMLElement): void => {
  slot.textContent = sim.transcript.join('\n')
  slot.scrollTop = slot.scrollHeight
}

const drawBandSlot = (sim: Sim, slot: HTMLElement, now: number): void => {
  if (!hasBand(sim)) {
    slot.replaceChildren()
    return
  }

  const band = bandModel(sim.quest, sim.tasks, metersOf(sim, now), sim.settings.bars, now)
  show(slot, drawBand($, {} as RenderInput<'AbovePrompt'>, band, 'raster', sim.motion.pose, sim.settings.avatar))
}

const drawHint = (sim: Sim, slot: HTMLElement, now: number): void => {
  const tail = hasHint(sim) ? ` ${hintText(sim.quest, sim.tasks, metersOf(sim, now), sim.settings.bars)}` : ''
  slot.textContent = `${ENGINE_HINT}${tail}`
}

/** A browser shows images, so `auto` finds out as a terminal that can would. */
const modeOf = (sim: Sim): Exclude<SceneMode, 'svg'> => (sim.settings.graphics === 'cells' ? 'raster' : 'image')

/** How many terminal columns the Road has on the page. */
export const roadColumns = (slots: Slots): number => {
  const cell = slots.ruler.getBoundingClientRect().width / RULER_CHARACTERS
  return cell > 0 ? Math.floor(slots.road.clientWidth / cell) : 0
}

const sceneInputs = (sim: Sim, columns: number) => ({
  quest: sim.quest,
  tasks: sim.tasks,
  companions: sim.companions,
  activity: sim.activity,
  foes: sim.foes,
  loot: sim.loot,
  allies: sim.allies,
  columns,
  motion: sim.motion,
  ...transitionOf(sim),
  cells: modeOf(sim) === 'raster',
})

const drawRoadSlot = (sim: Sim, slots: Slots, now: number): void => {
  const isShown = isRoadShown(sim)
  slots.pane.hidden = !isShown
  if (!isShown) return

  const columns = roadColumns(slots)
  const drawn = road({ ...sceneInputs(sim, columns), meters: metersOf(sim, now), log: sim.log, bars: sim.settings.bars, rows: ROAD_ROWS })
  show(slots.road, drawRoad($, {} as RenderInput<'Pane'>, drawn, modeOf(sim)))
}

export const drawAll = (sim: Sim, slots: Slots, now: number): void => {
  drawTranscript(sim, slots.transcript)
  drawRoadSlot(sim, slots, now)
  drawBandSlot(sim, slots.band, now)
  drawHint(sim, slots.hint, now)
}

/** One frame of the animation, as `blitFrame` paints it: the scene when it is shown, and the band's portrait. */
export const drawFrame = (sim: Sim, slots: Slots): void => {
  const columns = isRoadShown(sim) ? roadColumns(slots) : 0

  if (columns >= SCENE_MIN_COLUMNS) {
    const art = roadArt(sceneInputs(sim, columns))
    if (modeOf(sim) === 'image') blit(SCENE_IMAGE_KEY, { source: sceneImage(art) })
    else blit(SCENE_KEY, { cells: artCells(art) })
  }

  if (hasBand(sim)) blit(BAND_KEY, { cells: artCells(bandPortrait(sim.motion.pose, sim.settings.avatar)) })
}
