// A Raster's cells as pixels. What a terminal draws from `RasterProps.cells`:
// each cell is 2 x 2 pixels in two colours, and fonts leave gaps between block
// characters, so the page paints them itself. Pure.
import { QUADRANT } from '../../plugins/quest-hud/src/avatar'

/** Three little-endian words a cell: code point, foreground, background. */
const WORDS = 3

const words = (cells: string): Uint32Array => {
  const binary = atob(cells)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Uint32Array(bytes.buffer, 0, Math.floor(bytes.length / 4))
}

/** The cells as RGBA, `columns * 2` by `rows * 2` pixels; the terminal's own colour is left clear. */
export const cellPixels = (cells: string, columns: number, rows: number, defaultColor: number): Uint8ClampedArray<ArrayBuffer> => {
  const all = words(cells)
  const width = columns * 2
  const pixels = new Uint8ClampedArray(new ArrayBuffer(width * rows * 2 * 4))
  const put = (x: number, y: number, color: number): void => {
    if (color === defaultColor) return
    const at = (y * width + x) * 4
    pixels[at] = (color >> 16) & 255
    pixels[at + 1] = (color >> 8) & 255
    pixels[at + 2] = color & 255
    pixels[at + 3] = 255
  }

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = (row * columns + column) * WORDS
      const pattern = Math.max(0, QUADRANT.indexOf(all[cell] ?? 0x20))
      const ink = all[cell + 1] ?? defaultColor
      const paper = all[cell + 2] ?? defaultColor

      for (let bit = 0; bit < 4; bit++) {
        put(column * 2 + (bit & 1), row * 2 + (bit >> 1), pattern & (1 << bit) ? ink : paper)
      }
    }
  }

  return pixels
}
