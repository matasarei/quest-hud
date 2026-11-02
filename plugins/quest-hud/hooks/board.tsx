// The Quest Board's layout: draws a board view (src/github.ts) with the surface's
// own elements. It reads no state: register.tsx reads the values and passes them in.
import type { EngineInterface, RenderInput } from 'claude-code'

import type { BoardView } from '../src/github'
import { TONE_COLOR } from '../src/meters'

export const BOARD_ID = 'quest-board'
export const BOARD_TITLE = 'The Quest Board'

/** The board's tree. Titles are outside text: plain `Text` only. */
export function drawBoard($: EngineInterface, e: RenderInput<'Pane'>, view: BoardView) {
  const { Box, Text } = $.ui.resolve(e)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={TONE_COLOR.accent}>THE QUEST BOARD</Text>
        {view.status === '' ? null : <Text dimColor>{view.status}</Text>}
      </Box>
      {view.lines.map(line => <Text wrap="wrap">{line}</Text>)}
      {view.sections.map(section => (
        <Box key={section.rank} flexDirection="column">
          <Text bold>{section.head}</Text>
          {section.rows.map(row => <Text key={row.id} wrap="truncate-end">{`${row.label}  ${row.text}  ${row.age}`}</Text>)}
        </Box>
      ))}
      {view.notes.map(note => <Text dimColor wrap="wrap">{note}</Text>)}
    </Box>
  )
}
