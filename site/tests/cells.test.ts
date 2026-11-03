import assert from 'node:assert/strict'
import { test } from 'node:test'

import { artCells } from '../../plugins/quest-hud/hooks/pane'
import { DEFAULT_COLOR, gridToQuadrantCells } from '../../plugins/quest-hud/src/avatar'
import { roadArt } from '../../plugins/quest-hud/src/road'
import { NO_FOES } from '../../plugins/quest-hud/src/bash'
import { cellPixels } from '../src/cells'

const RED = 0xff0000
const BLUE = 0x0000ff

test('a cell of two colours comes back as its four pixels', () => {
  const cells = gridToQuadrantCells([[RED, BLUE], [BLUE, RED]])
  const pixels = cellPixels(cells, 1, 1, DEFAULT_COLOR)

  assert.deepEqual([...pixels], [255, 0, 0, 255, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 0, 255])
})

test("the terminal's own colour stays clear", () => {
  const cells = gridToQuadrantCells([[RED, DEFAULT_COLOR], [DEFAULT_COLOR, DEFAULT_COLOR]])
  const pixels = cellPixels(cells, 1, 1, DEFAULT_COLOR)

  assert.deepEqual([...pixels.slice(0, 4)], [255, 0, 0, 255])
  assert.deepEqual([...pixels.slice(4)], new Array(12).fill(0))
})

test("a frame of the Road decodes to the size its cells say, with nothing left clear", () => {
  const art = roadArt({ quest: null, tasks: [], companions: [], activity: null, foes: NO_FOES, loot: 0, allies: { octopus: false, fox: false }, columns: 60, cells: true })
  const pixels = cellPixels(artCells(art), 60, 14, DEFAULT_COLOR)

  assert.equal(pixels.length, 60 * 2 * 14 * 2 * 4)
  assert.ok(pixels.every((value, i) => i % 4 !== 3 || value === 255))
})
