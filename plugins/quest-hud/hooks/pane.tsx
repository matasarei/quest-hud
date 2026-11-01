// The Road pane's layout: draws a Road (src/road.ts) with the surface's own
// elements. It reads no state: register.tsx reads the values and passes them in.
import type { EngineInterface, RenderInput } from 'claude-code'

import { gridSize, gridToRasterCells, gridToRgba, gridToSvg, imageScale, type Grid, type RgbaSource } from '../src/avatar'
import { TONE_COLOR } from '../src/meters'
import type { Road } from '../src/road'

export const PANE_ID = 'quest-hud'
export const PANE_TITLE = 'The Road'
/** The Raster's key, which $.ui.blit names to repaint the scene. */
export const SCENE_KEY = 'scene'
/** The Image's key, which the probe blits to learn whether images draw here. */
export const SCENE_IMAGE_KEY = 'scene-image'
/** An Image is at most this many cells a side. */
const IMAGE_CELLS = 255

/**
 * How the scene is drawn: as text cells (`raster`, any terminal), as true
 * pixels (`image`, terminals that show images), or as an Svg (other surfaces).
 */
export type SceneMode = 'raster' | 'image' | 'svg'

/** The scene as RasterProps.cells, for a draw or a blit. */
export const sceneCells = (grid: Grid): string => gridToRasterCells(grid)

/** The scene as an Image's pixels, scaled as large as the Image's limits allow. */
export const sceneImage = (grid: Grid): RgbaSource => {
  const { columns } = gridSize(grid)
  return gridToRgba(grid, imageScale(columns, grid.length))
}

/** The pane's tree, the scene drawn the way `mode` says. */
export function drawRoad($: EngineInterface, e: RenderInput<'Pane'>, road: Road, mode: SceneMode, image?: RgbaSource) {
  const elements = $.ui.resolve(e)
  const { Box, Text } = elements
  const { columns, rows } = gridSize(road.scene)
  // resolve() names every element on every surface, and one a surface lacks
  // draws as an empty fragment: the caller picks the mode from the surface.
  const scene = mode === 'image' && 'Image' in elements
    ? (
        <elements.Image
          key={SCENE_IMAGE_KEY}
          source={image ?? sceneImage(road.scene)}
          columns={Math.min(IMAGE_CELLS, Math.max(1, columns))}
          rows={Math.min(IMAGE_CELLS, Math.max(1, rows))}
          alt="the road"
        />
      )
    : mode === 'raster' && 'Raster' in elements
      ? <elements.Raster key={SCENE_KEY} columns={Math.max(1, columns)} rows={rows} cells={sceneCells(road.scene)} />
      : 'Svg' in elements
        ? <elements.Svg source={gridToSvg(road.scene)} alt="the road" width={columns * 8} height={rows * 16} />
        : null

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={TONE_COLOR.accent} wrap="truncate-end">{road.header}</Text>
        {road.count ? <Text dimColor>{road.count}</Text> : null}
      </Box>
      {columns > 0 ? scene : null}
      {road.companions ? <Text dimColor wrap="truncate-end">{road.companions}</Text> : null}
      {road.tasks.map(line => <Text wrap="truncate-end">{line}</Text>)}
      <Box flexDirection="row">
        {road.meters.map(segment => <Text color={TONE_COLOR[segment.tone]}>{segment.text}</Text>)}
      </Box>
      {road.log.length > 0 ? <Text dimColor>— log —</Text> : null}
      {road.log.map(line => <Text dimColor wrap="truncate-end">{line}</Text>)}
    </Box>
  )
}
