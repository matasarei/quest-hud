// Draws a session with the mod's own models and layouts, into the page's slots.
import type { RenderInput } from 'claude-code'

import { BAND_KEY, drawBand } from '../../plugins/quest-hud/hooks/band'
import { drawBoard } from '../../plugins/quest-hud/hooks/board'
import { artCells, drawRoad, SCENE_IMAGE_KEY, SCENE_KEY, sceneImage, type SceneMode } from '../../plugins/quest-hud/hooks/pane'
import { boardView } from '../../plugins/quest-hud/src/github'
import { bandModel, hintText } from '../../plugins/quest-hud/src/meters'
import { road, roadArt, SCENE_MIN_COLUMNS } from '../../plugins/quest-hud/src/road'
import { bandPortrait } from '../../plugins/quest-hud/src/scene'
import { $, blit, show } from './engine'
import { lineParts, XTERM } from './hudline'
import { hasBand, hasHint, isBoardShown, isRoadShown, metersOf, transitionOf, type Sim } from './session'

export type Slots = Readonly<{
  transcript: HTMLElement
  band: HTMLElement
  hint: HTMLElement
  pane: HTMLElement
  road: HTMLElement
  board: HTMLElement
  roadTab: HTMLElement
  boardTab: HTMLElement
  paneExample: HTMLElement
  statusLine: HTMLElement
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

const columnsOf = (slot: HTMLElement, slots: Slots): number => {
  const cell = slots.ruler.getBoundingClientRect().width / RULER_CHARACTERS
  return cell > 0 ? Math.floor(slot.clientWidth / cell) : 0
}

/** How many terminal columns the Road has on the page. */
export const roadColumns = (slots: Slots): number => columnsOf(slots.road, slots)

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
  slots.road.hidden = !isShown
  if (!isShown) return

  const columns = roadColumns(slots)
  const drawn = road({ ...sceneInputs(sim, columns), meters: metersOf(sim, now), log: sim.log, bars: sim.settings.bars, rows: ROAD_ROWS, level: sim.level })
  show(slots.road, drawRoad($, {} as RenderInput<'Pane'>, drawn, modeOf(sim)))
}

const drawBoardSlot = (sim: Sim, slots: Slots, now: number, onFold: () => void): void => {
  const isShown = isBoardShown(sim)
  slots.board.hidden = !isShown
  slots.paneExample.hidden = !isShown
  if (!isShown) return

  const e = { props: { bodyColumns: columnsOf(slots.board, slots) } } as RenderInput<'Pane'>
  show(slots.board, drawBoard($, e, boardView(sim.board, now, sim.isTrivialOpen), onFold))
}

const drawTabs = (sim: Sim, slots: Slots): void => {
  slots.pane.hidden = !isRoadShown(sim) && !isBoardShown(sim)
  slots.roadTab.hidden = !sim.isRoadOpen
  slots.boardTab.hidden = !sim.isBoardOpen
  slots.roadTab.setAttribute('aria-pressed', String(isRoadShown(sim)))
  slots.boardTab.setAttribute('aria-pressed', String(isBoardShown(sim)))
}

/** The classic status line, which runs where mods do not, so no setting of the mod's reaches it. */
const drawStatusLine = (sim: Sim, slot: HTMLElement): void => {
  const input = { context_window: { used_percentage: 100 - sim.mp }, rate_limits: { seven_day: { used_percentage: 100 - sim.hp } } }

  slot.replaceChildren(...lineParts(input).flatMap((part, i) => {
    const span = document.createElement('span')
    span.textContent = part.text
    span.style.color = XTERM[part.code] ?? ''
    return i === 0 ? [span] : [' ', span]
  }))
}

export const drawAll = (sim: Sim, slots: Slots, now: number, onFold: () => void): void => {
  drawStatusLine(sim, slots.statusLine)
  drawTranscript(sim, slots.transcript)
  drawTabs(sim, slots)
  drawRoadSlot(sim, slots, now)
  drawBoardSlot(sim, slots, now, onFold)
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
