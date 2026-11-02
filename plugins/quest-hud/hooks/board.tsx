// The Quest Board's layout: draws a board view (src/github.ts) with the surface's
// own elements. It reads no state: register.tsx reads the values and passes them in.
import type { EngineInterface, RenderInput } from 'claude-code'

import { NO_BOARD_TEXT } from '../src/github'

export const BOARD_ID = 'quest-board'
export const BOARD_TITLE = 'The Quest Board'

/** The board's tree. */
export function drawBoard($: EngineInterface, e: RenderInput<'Pane'>) {
  const { Box, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      <Text dimColor wrap="wrap">{NO_BOARD_TEXT}</Text>
    </Box>
  )
}
