// The avatar: one pixel map, drawn as half-block cells on a terminal (Raster)
// and as rectangles elsewhere (Svg). One character per pixel; '.' is empty.

export const AVATAR: readonly string[] = [
  '.....HH.....',
  '....HHHH....',
  '...HHHHHH...',
  '..hhhhhhhh..',
  '...SSSSSS...',
  '...SESSES...',
  '...SSSSSS...',
  '..RRRRRRRRg.',
  '.RRRRRRRRRs.',
  '.SRRRBBRRRs.',
  '..RRRRRRRRs.',
  '..RRrRRrRRs.',
  '..RRrRRrRRs.',
  '..RRRRRRRRs.',
  '...kk..kk.s.',
  '...kk..kk...',
]

/** The band's avatar: 6x6 pixels, three cell rows beside the two text rows. */
export const AVATAR_SMALL: readonly string[] = [
  '..HH..',
  '.HHHH.',
  'hhhhhh',
  '.ESSE.',
  '.RRRRs',
  'RRBBRs',
]

export type Palette = Readonly<Record<string, number>>

/** The mage, in the mocks' colours, as 0xRRGGBB. */
export const MAGE: Palette = {
  H: 0x6a55e0, h: 0xf2d15b, S: 0xf1c7a1, E: 0x14151b, R: 0x6a55e0, r: 0x4c3da1,
  B: 0xf2d15b, s: 0x8a5a2b, g: 0x6fe3ff, k: 0x3a2a1a,
}

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

export const toRasterCells = (map: readonly string[], palette: Palette): string => gridToRasterCells(mapToGrid(map, palette))

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
