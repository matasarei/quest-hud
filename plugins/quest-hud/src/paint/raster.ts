// Pictures to pixels: each unit drawn as `scale × scale` pixels, edges smoothed
// by four samples a pixel. Scale 1 gives the cells' grid; a larger one, an
// image. Pure.
import type { Grid } from '../avatar'
import { bounds, colorAt, contains, type Picture } from './picture'

/** Pixels, three bytes each (red, green, blue), row by row. */
export type Rgb = { width: number; height: number; data: Uint8Array }

/** Where in a pixel the four samples sit: smooth edges at a quarter of the cost of more. */
const SAMPLES: ReadonlyArray<readonly [number, number]> = [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]

/**
 * The picture painted over `background` on `unitsWide × unitsHigh` units,
 * each `scale` pixels a side. A shape's edge pixel takes as much of its
 * colour as of the pixel it covers.
 */
export const rasterize = (picture: Picture, unitsWide: number, unitsHigh: number, scale: number, background = 0): Rgb => {
  const s = Math.max(1, Math.floor(scale))
  const width = Math.max(0, Math.floor(unitsWide * s))
  const height = Math.max(0, Math.floor(unitsHigh * s))
  const r = new Float32Array(width * height).fill((background >> 16) & 255)
  const g = new Float32Array(width * height).fill((background >> 8) & 255)
  const b = new Float32Array(width * height).fill(background & 255)

  for (const shape of picture) {
    const [left, top, right, bottom] = bounds(shape)
    const x0 = Math.max(0, Math.floor(left * s))
    const x1 = Math.min(width, Math.ceil(right * s))
    const y0 = Math.max(0, Math.floor(top * s))
    const y1 = Math.min(height, Math.ceil(bottom * s))
    const opacity = shape.opacity ?? 1

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        let hits = 0
        for (const [dx, dy] of SAMPLES) if (contains(shape, (x + dx) / s, (y + dy) / s)) hits++
        if (hits === 0) continue
        const a = (hits / SAMPLES.length) * opacity
        const color = colorAt(shape.fill, (y + 0.5) / s)
        const i = y * width + x
        r[i] = (r[i] as number) + (((color >> 16) & 255) - (r[i] as number)) * a
        g[i] = (g[i] as number) + (((color >> 8) & 255) - (g[i] as number)) * a
        b[i] = (b[i] as number) + ((color & 255) - (b[i] as number)) * a
      }
    }
  }

  const data = new Uint8Array(width * height * 3)
  for (let i = 0; i < width * height; i++) {
    data[i * 3] = Math.round(r[i] as number)
    data[i * 3 + 1] = Math.round(g[i] as number)
    data[i * 3 + 2] = Math.round(b[i] as number)
  }
  return { width, height, data }
}

/** The pixels as the cells' grid: a colour per pixel, rows of columns. */
export const rgbToGrid = ({ width, height, data }: Rgb): Grid =>
  Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const i = (y * width + x) * 3
      return ((data[i] as number) << 16) | ((data[i + 1] as number) << 8) | (data[i + 2] as number)
    }),
  )

/** The pixels as RGBA bytes, every one opaque. */
export const rgbToRgba = ({ width, height, data }: Rgb): Uint8Array => {
  const out = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    out[i * 4] = data[i * 3] as number
    out[i * 4 + 1] = data[i * 3 + 1] as number
    out[i * 4 + 2] = data[i * 3 + 2] as number
    out[i * 4 + 3] = 255
  }
  return out
}
