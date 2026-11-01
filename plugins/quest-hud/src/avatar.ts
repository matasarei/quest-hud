// Pixel grids drawn as half-block cells on a terminal (Raster), as rectangles
// elsewhere (Svg), or as an Image's pixels; and pixel maps, one character a
// pixel ('.' is empty), read through a palette.

export type Palette = Readonly<Record<string, number>>

/** Raster's word for the terminal's own default colour. */
export const DEFAULT_COLOR = 0x01000000

const UPPER_HALF = 0x2580
const LOWER_HALF = 0x2584
const SPACE = 0x20

/** Pixels as rows of 0xRRGGBB colours; undefined is an empty pixel. */
export type Grid = ReadonlyArray<ReadonlyArray<number | undefined>>

/** A pixel map through its palette; a character the palette lacks is empty. */
export const mapToGrid = (map: readonly string[], palette: Palette): Grid =>
  map.map(line => [...line].map(char => palette[char]))

const width = (grid: Grid): number => grid[0]?.length ?? 0

/** Cells across and down: one column per pixel, two pixel rows per cell row. */
export const gridSize = (grid: Grid): { columns: number; rows: number } => ({
  columns: width(grid),
  rows: Math.ceil(grid.length / 2),
})

/** The same for a pixel map. */
export const rasterSize = (map: readonly string[]): { columns: number; rows: number } => ({
  columns: map[0]?.length ?? 0,
  rows: Math.ceil(map.length / 2),
})

/**
 * Each cell as [code point, foreground, background]. A cell whose top pixel is
 * empty uses the lower half block, so no half is painted in the terminal's
 * default foreground; an empty cell is a space on the default colours.
 */
export const gridWords = (grid: Grid): number[] => {
  const { columns, rows } = gridSize(grid)
  const words: number[] = []

  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < columns; x++) {
      const top = grid[row * 2]?.[x]
      const bottom = grid[row * 2 + 1]?.[x]

      if (top !== undefined) words.push(UPPER_HALF, top, bottom ?? DEFAULT_COLOR)
      else if (bottom !== undefined) words.push(LOWER_HALF, bottom, DEFAULT_COLOR)
      else words.push(SPACE, DEFAULT_COLOR, DEFAULT_COLOR)
    }
  }

  return words
}

export const rasterWords = (map: readonly string[], palette: Palette): number[] => gridWords(mapToGrid(map, palette))

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64; written here because the module has no DOM or Node. */
export const toBase64 = (bytes: Uint8Array): string => {
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const triple = (a << 16) | (b << 8) | c

    out += ALPHABET[(triple >> 18) & 63]
    out += ALPHABET[(triple >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[triple & 63] : '='
  }

  return out
}

/** `RasterProps.cells`: the words as little-endian u32s, base64. */
export const gridToRasterCells = (grid: Grid): string => {
  const words = gridWords(grid)
  const view = new DataView(new ArrayBuffer(words.length * 4))

  words.forEach((word, i) => view.setUint32(i * 4, word, true))

  return toBase64(new Uint8Array(view.buffer))
}

/**
 * The sixteen 2 × 2 block characters, by pattern: top-left 1, top-right 2,
 * bottom-left 4, bottom-right 8. All in the BMP, as a Raster needs: the
 * octants (2 × 4) are not.
 */
export const QUADRANT: readonly number[] = [
  0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b,
  0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588,
]

const FULL = 0x2588

/** How far apart two colours are; the terminal's own background is far from every colour. */
const distance = (a: number, b: number): number => {
  if (a === DEFAULT_COLOR || b === DEFAULT_COLOR) return a === b ? 0 : Infinity
  return Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255))
}

/**
 * Each cell, two pixels across and two down, as [code point, foreground,
 * background]. A cell shows two colours: its two most common (the first seen
 * of equals), every other pixel taking the nearer of them. The ink is the
 * top-left pixel's colour, or the other one when that pixel is empty; an
 * empty pixel is the terminal's own background. One colour is a full block;
 * nothing at all, a space on the default colours.
 */
export const quadrantWords = (grid: Grid): number[] => {
  const columns = Math.ceil(width(grid) / 2)
  const rows = Math.ceil(grid.length / 2)
  const words: number[] = []

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const corners: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [0, 1], [1, 1]]
      const pixels = corners.map(([dx, dy]) => grid[row * 2 + dy]?.[column * 2 + dx] ?? DEFAULT_COLOR)
      // A Map keeps the order colours were first seen in, so equals go to the first.
      const counts = new Map<number, number>()
      for (const color of pixels) counts.set(color, (counts.get(color) ?? 0) + 1)
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([color]) => color)
      const first = ranked[0] ?? DEFAULT_COLOR
      const second = ranked[1]

      if (second === undefined) {
        words.push(...(first === DEFAULT_COLOR ? [SPACE, DEFAULT_COLOR, DEFAULT_COLOR] : [FULL, first, first]))
        continue
      }

      const kept = pixels.map(color => (color === first || color === second ? color : distance(color, first) <= distance(color, second) ? first : second))
      const topLeft = kept[0] ?? DEFAULT_COLOR
      const ink = topLeft === DEFAULT_COLOR ? (first === DEFAULT_COLOR ? second : first) : topLeft
      const other = ink === first ? second : first
      const pattern = kept.reduce((bits, color, i) => (color === ink ? bits | (1 << i) : bits), 0)
      words.push(QUADRANT[pattern] ?? SPACE, ink, other)
    }
  }

  return words
}

/** `RasterProps.cells` in quadrants: the words of `quadrantWords`, little-endian, base64. */
export const gridToQuadrantCells = (grid: Grid): string => {
  const words = quadrantWords(grid)
  const view = new DataView(new ArrayBuffer(words.length * 4))
  words.forEach((word, i) => view.setUint32(i * 4, word, true))
  return toBase64(new Uint8Array(view.buffer))
}

export const toRasterCells = (map: readonly string[], palette: Palette): string => gridToRasterCells(mapToGrid(map, palette))

/** An Image's base64 pixels may decode to at most this many bytes. */
export const IMAGE_BYTES = 2 * 1024 * 1024
/** An Image's `rgba` source is at most this many pixels a side. */
export const IMAGE_SIDE = 2048

/**
 * The largest of 4, 3, 2 and 1 at which a `width × height` grid, each pixel a
 * scale × scale square, stays within the Image's limits: 2 MiB of RGBA bytes,
 * 2048 pixels a side. 1 when even that does not fit, as the caller has no smaller.
 */
export const imageScale = (width: number, height: number): number =>
  [4, 3, 2].find(s => width * s * height * s * 4 <= IMAGE_BYTES && width * s <= IMAGE_SIDE && height * s <= IMAGE_SIDE) ?? 1

export type RgbaSource = { rgba: string; width: number; height: number }

/**
 * `ImageSource`'s `{ rgba, width, height }`: each pixel a scale × scale square
 * (nearest neighbour, so pixel art stays crisp), empty pixels fully
 * transparent. An empty grid is one transparent pixel, as a source needs one.
 */
export const gridToRgba = (grid: Grid, scale: number): RgbaSource => {
  const s = Math.max(1, Math.floor(scale))
  const columns = width(grid)
  const rows = grid.length

  if (columns === 0 || rows === 0) {
    return { rgba: toBase64(new Uint8Array(4)), width: 1, height: 1 }
  }

  const out = new Uint8Array(columns * s * rows * s * 4)
  const stride = columns * s * 4

  grid.forEach((line, y) => {
    for (let x = 0; x < columns; x++) {
      const color = line[x]
      if (color === undefined) continue
      for (let dy = 0; dy < s; dy++) {
        for (let dx = 0; dx < s; dx++) {
          const at = (y * s + dy) * stride + (x * s + dx) * 4
          out[at] = (color >> 16) & 0xff
          out[at + 1] = (color >> 8) & 0xff
          out[at + 2] = color & 0xff
          out[at + 3] = 0xff
        }
      }
    }
  })

  return { rgba: toBase64(out), width: columns * s, height: rows * s }
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

/**
 * `Svg.source`: rectangles and nothing else. A run of same-coloured pixels in
 * a row is one rectangle, which keeps a wide scene's markup small.
 */
export const gridToSvg = (grid: Grid): string => {
  let rects = ''

  grid.forEach((line, y) => {
    let x = 0

    while (x < line.length) {
      const color = line[x]
      let end = x + 1

      while (end < line.length && line[end] === color) end++
      if (color !== undefined) rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${hex(color)}"/>`
      x = end
    }
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width(grid)} ${grid.length}" shape-rendering="crispEdges">${rects}</svg>`
}

export const toSvg = (map: readonly string[], palette: Palette): string => gridToSvg(mapToGrid(map, palette))
