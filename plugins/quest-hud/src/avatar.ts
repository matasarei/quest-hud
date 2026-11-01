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

const pixel = (map: readonly string[], palette: Palette, x: number, y: number): number | undefined => palette[map[y]?.[x] ?? '.']

/** Cells across and down: one column per pixel, two pixel rows per cell row. */
export const rasterSize = (map: readonly string[]): { columns: number; rows: number } => ({
  columns: map[0]?.length ?? 0,
  rows: Math.ceil(map.length / 2),
})

/**
 * Each cell as [code point, foreground, background]. A cell whose top pixel is
 * empty uses the lower half block, so no half is painted in the terminal's
 * default foreground; an empty cell is a space on the default colours.
 */
export const rasterWords = (map: readonly string[], palette: Palette): number[] => {
  const { columns, rows } = rasterSize(map)
  const words: number[] = []

  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < columns; x++) {
      const top = pixel(map, palette, x, row * 2)
      const bottom = pixel(map, palette, x, row * 2 + 1)

      if (top !== undefined) words.push(UPPER_HALF, top, bottom ?? DEFAULT_COLOR)
      else if (bottom !== undefined) words.push(LOWER_HALF, bottom, DEFAULT_COLOR)
      else words.push(SPACE, DEFAULT_COLOR, DEFAULT_COLOR)
    }
  }

  return words
}

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
export const toRasterCells = (map: readonly string[], palette: Palette): string => {
  const words = rasterWords(map, palette)
  const view = new DataView(new ArrayBuffer(words.length * 4))

  words.forEach((word, i) => view.setUint32(i * 4, word, true))

  return toBase64(new Uint8Array(view.buffer))
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`

/** `Svg.source`: one rectangle per pixel, nothing else. */
export const toSvg = (map: readonly string[], palette: Palette): string => {
  const width = map[0]?.length ?? 0
  let rects = ''

  map.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const color = pixel(map, palette, x, y)
      if (color !== undefined) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${hex(color)}"/>`
    }
  })

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${map.length}" shape-rendering="crispEdges">${rects}</svg>`
}
