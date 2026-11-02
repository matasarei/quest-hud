// Pixel art: sprites as hand-authored maps of characters, each a colour from
// the sprite's palette ('.' is see-through), stamped onto an art grid; ordered
// dithering for gradients and see-through shapes, as pixel art does it rather
// than blending; and the grid scaled up crisply for an image, or down by
// blocks for the cells. Pure.
import type { Grid } from '../avatar'
import type { Rgb } from './raster'

/** A sprite: rows of characters, each a key of `palette`, or '.' for none. */
export type Sprite = { rows: readonly string[]; palette: Readonly<Record<string, number>> }

/** A canvas of art pixels being drawn on: rows of colours. */
export type Canvas = Array<Array<number | undefined>>

/** The sprite's pixels; `paint` may recolour each one. */
export const spriteGrid = (sprite: Sprite, paint: (color: number) => number = color => color): Grid =>
  sprite.rows.map(row => [...row].map(key => (key === '.' ? undefined : paint(sprite.palette[key] ?? 0xff00ff))))

/** The grid flipped left to right. */
export const mirrorGrid = (grid: Grid): Grid => grid.map(line => [...line].reverse())

export const gridWidth = (grid: Grid): number => grid.reduce((most, line) => Math.max(most, line.length), 0)

/**
 * Paints the grid's pixels onto the canvas with its top-left at (x, y); none
 * outside it, nor outside the columns `from` to `to` (end excluded), the
 * whole row when left out.
 */
export const stamp = (canvas: Canvas, grid: Grid, x: number, y: number, from = 0, to = Infinity): void => {
  const left = Math.round(x)
  const top = Math.round(y)
  grid.forEach((line, dy) => {
    const row = canvas[top + dy]
    if (!row) return
    const first = Math.max(0, from)
    const end = Math.min(row.length, to)
    line.forEach((color, dx) => {
      if (color !== undefined && left + dx >= first && left + dx < end) row[left + dx] = color
    })
  })
}

/** The 4 × 4 Bayer matrix, as thresholds from 1/32 to 31/32. */
const BAYER: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16)

/** The threshold the pixel (x, y) compares against: the same pattern repeats every four pixels. */
export const bayer = (x: number, y: number): number => BAYER[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)] as number

/**
 * The band, 0 to `bands - 1`, that a pixel takes for a value `t` from 0 to 1:
 * between two bands the pixels mix in the Bayer pattern, so a gradient is a
 * few flat colours dithered into each other.
 */
export const ditherBand = (t: number, bands: number, x: number, y: number): number => {
  const scaled = Math.max(0, Math.min(1, t)) * (bands - 1)
  const low = Math.floor(scaled)
  return Math.min(bands - 1, low + (scaled - low > bayer(x, y) ? 1 : 0))
}

/** Whether a pixel of a shape `opacity` see-through is drawn: that share of pixels, in the Bayer pattern. */
export const ditherOn = (opacity: number, x: number, y: number): boolean => opacity > bayer(x, y)

/**
 * The grid made `fx` times narrower and `fy` times shorter (`fx` both ways
 * when `fy` is left out): each block becomes its most common colour, the first
 * seen of equals, so pixel art stays crisp.
 */
export const downsample = (grid: Grid, fx: number, fy = fx): Grid => {
  const w = Math.max(1, Math.floor(fx))
  const h = Math.max(1, Math.floor(fy))
  const width = Math.floor(gridWidth(grid) / w)
  const height = Math.floor(grid.length / h)
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      // A Map keeps the order colours were first seen in, so equals go to the first.
      const counts = new Map<number | undefined, number>()
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const color = grid[y * h + dy]?.[x * w + dx]
          counts.set(color, (counts.get(color) ?? 0) + 1)
        }
      }
      let best: number | undefined
      let bestCount = 0
      for (const [color, count] of counts) {
        if (count > bestCount) {
          best = color
          bestCount = count
        }
      }
      return best
    }),
  )
}

/** The grid as RGB pixels, each art pixel a `scale × scale` square; an empty one black. */
export const gridToRgb = (grid: Grid, scale: number): Rgb => {
  const s = Math.max(1, Math.floor(scale))
  const width = gridWidth(grid) * s
  const height = grid.length * s
  const data = new Uint8Array(width * height * 3)
  grid.forEach((line, y) => {
    line.forEach((color, x) => {
      if (color === undefined) return
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const i = ((y * s + dy) * width + x * s + dx) * 3
          data[i] = (color >> 16) & 255
          data[i + 1] = (color >> 8) & 255
          data[i + 2] = color & 255
        }
      }
    })
  })
  return { width, height, data }
}
