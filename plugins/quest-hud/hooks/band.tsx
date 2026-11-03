// The band's layout: draws a band (src/meters.ts) and its portrait with the
// surface's own elements. It reads no state: register.tsx reads the values and
// passes them in.
import type { EngineInterface, RenderInput } from 'claude-code'

import { gridToSvg } from '../src/avatar'
import { TONE_COLOR, type Band } from '../src/meters'
import { downsample } from '../src/paint/pixels'
import { BAND, BAND_GAP, bandPortrait } from '../src/scene'
import { ART_SCALE, BAND_AVATARS, type Avatar, type Pose } from '../src/world/sprites'
import { artCells } from './pane'

/** The band portrait's key, which $.ui.blit names to step it with the animation. */
export const BAND_KEY = 'avatar'

/** How the portrait is drawn: as text cells, as an Svg, or not at all where there is no room. */
export type PortraitMode = 'raster' | 'svg' | 'none'

/** The band's tree, the portrait drawn the way `mode` says, and `line` above the quest when there is one. */
export function drawBand($: EngineInterface, e: RenderInput<'AbovePrompt'>, band: Band, mode: PortraitMode, pose: Pose, avatar: Avatar, line?: string) {
  const elements = $.ui.resolve(e)
  const { Box, Text } = elements
  const row = (key: string, segments: Band['head']) => (
    <Box key={key} flexDirection="row">
      {segments.map((segment, i) => (
        // Only the last piece may be cut: Texts alone in a row would all shrink at once.
        <Box flexShrink={i === segments.length - 1 ? 1 : 0}>
          <Text color={TONE_COLOR[segment.tone]} dimColor={segment.tone === 'dim'} wrap="truncate-end">
            {segment.text}
          </Text>
        </Box>
      ))}
    </Box>
  )
  const portrait = mode === 'raster' && 'Raster' in elements
    ? <elements.Raster key={BAND_KEY} columns={BAND.columns} rows={BAND.rows} cells={artCells(bandPortrait(pose, avatar))} />
    : mode === 'svg' && 'Svg' in elements
      ? <elements.Svg source={gridToSvg(downsample(bandPortrait('stand', avatar), ART_SCALE))} alt={BAND_AVATARS[avatar].alt} width={BAND.columns * 4} height={BAND.rows * 8} />
      : null

  return (
    <Box key="band" flexDirection="row" gap={BAND_GAP} alignItems="center">
      {portrait}
      <Box flexDirection="column">
        {line === undefined ? null : <Text dimColor wrap="truncate-end">{line}</Text>}
        {row('head', band.head)}
        {row('meters', band.meters)}
      </Box>
    </Box>
  )
}
