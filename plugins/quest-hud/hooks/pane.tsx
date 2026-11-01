// The Road pane's layout: draws a Road (src/road.ts) with the surface's own
// elements. It reads no state: register.tsx reads the values and passes them in.
import type { EngineInterface, RenderInput } from 'claude-code'

import { gridSize, gridToRasterCells, gridToSvg, type Grid } from '../src/avatar'
import { TONE_COLOR } from '../src/meters'
import type { Road } from '../src/road'

export const PANE_ID = 'quest-hud'
export const PANE_TITLE = 'The Road'
/** The Raster's key, which $.ui.blit names to repaint the scene. */
export const SCENE_KEY = 'scene'

/** The scene as RasterProps.cells, for a draw or a blit. */
export const sceneCells = (grid: Grid): string => gridToRasterCells(grid)

/** The pane's tree: the scene as a Raster on the terminal, as an Svg elsewhere. */
export function drawRoad($: EngineInterface, e: RenderInput<'Pane'>, road: Road) {
  const elements = $.ui.resolve(e)
  const { Box, Text } = elements
  const { columns, rows } = gridSize(road.scene)
  // resolve() names every element on every surface, and one a surface lacks
  // draws as an empty fragment: the surface decides, not the table.
  const scene = e.surface === 'terminal' && 'Raster' in elements
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
