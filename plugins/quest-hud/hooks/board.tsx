// The Quest Board's layout: draws a board view (src/github.ts) with the surface's
// own elements. It reads no state: register.tsx reads the values and passes them in.
import type { EngineInterface, RenderInput } from 'claude-code'

import { RANK_COLOR, type BoardRow, type BoardView } from '../src/github'
import { TONE_COLOR } from '../src/meters'

export const BOARD_ID = 'quest-board'
export const BOARD_TITLE = 'The Quest Board'
/** From this wide a row fits on one line. */
const ONE_LINE_COLUMNS = 72

/**
 * The board's tree. A title is outside text: plain `Text` only, never `Markdown`,
 * and never inside a `Link`, whose href is checked and whose label is built from
 * that href's own parts.
 */
export function drawBoard($: EngineInterface, e: RenderInput<'Pane'>, view: BoardView, onFold: () => void) {
  const { Box, Text, Link, Button } = $.ui.resolve(e)
  const isOneLine = e.props.bodyColumns >= ONE_LINE_COLUMNS
  // A label keeps its width, so a long one does not wrap: the title gives way.
  const label = (row: BoardRow) => (
    <Box key="label" flexShrink={0}>
      {row.href === undefined ? <Text dimColor>{row.label}</Text> : <Text><Link href={row.href} label={row.label} /></Text>}
    </Box>
  )

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={TONE_COLOR.accent} bold>THE QUEST BOARD</Text>
        {view.status === '' ? null : <Text dimColor>{view.status}</Text>}
      </Box>
      {view.lines.map(line => <Text wrap="wrap">{line}</Text>)}
      {view.sections.map(section => {
        const isDim = section.rank === 'minion' || section.rank === 'trivial'

        return (
          <Box key={section.rank} flexDirection="column" marginTop={1}>
            <Text color={RANK_COLOR[section.rank]} dimColor={isDim} bold>{section.head}</Text>
            {section.rows.map(row => (isOneLine
              ? (
                  <Box key={row.id} flexDirection="row" gap={2}>
                    {label(row)}
                    <Box flexGrow={1} flexShrink={1}><Text dimColor={isDim} wrap="truncate-end">{row.text}</Text></Box>
                    <Text dimColor>{row.age}</Text>
                  </Box>
                )
              : (
                  <Box key={row.id} flexDirection="column">
                    <Box flexDirection="row" justifyContent="space-between">
                      {label(row)}
                      <Text dimColor>{row.age}</Text>
                    </Box>
                    <Text dimColor={isDim} wrap="truncate-end">{`  ${row.text}`}</Text>
                  </Box>
                )))}
          </Box>
        )
      })}
      {view.fold === undefined ? null : <Box marginTop={1}><Button key="trivial" label={view.fold} hotkey="t" plain dimColor onPress={onFold} /></Box>}
      {view.notes.length === 0 ? null : <Box marginTop={1} flexDirection="column">{view.notes.map(note => <Text dimColor wrap="wrap">{note}</Text>)}</Box>}
    </Box>
  )
}
