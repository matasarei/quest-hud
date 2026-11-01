import { describe, expect, test } from 'claude-code/testing'

import {
  DEFAULT_COLOR, gridSize, gridToQuadrantCells, gridToRasterCells, gridToRgba, gridToSvg, gridWords, IMAGE_BYTES, imageScale, QUADRANT, quadrantWords,
  mapToGrid, rasterSize, rasterWords, toBase64, toRasterCells, toSvg, type Grid, type Palette,
} from '../src/avatar'

// A 12 × 16 pixel map and its palette to encode: the mage the band once drew.
const MAP: readonly string[] = [
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
const COLORS: Palette = {
  H: 0x6a55e0, h: 0xf2d15b, S: 0xf1c7a1, E: 0x14151b, R: 0x6a55e0, r: 0x4c3da1,
  B: 0xf2d15b, s: 0x8a5a2b, g: 0x6fe3ff, k: 0x3a2a1a,
}

/** Paints an SVG's rectangles back onto a grid of its size, to compare pixel for pixel. */
const paint = (svg: string, columns: number, rows: number): Grid => {
  const grid: Array<Array<number | undefined>> = Array.from({ length: rows }, () => Array<number | undefined>(columns).fill(undefined))
  for (const [, x, y, w, h, fill] of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="#([0-9a-f]{6})"\/>/g)) {
    for (let dy = 0; dy < Number(h); dy++) {
      for (let dx = 0; dx < Number(w); dx++) {
        const row = grid[Number(y) + dy]
        if (row) row[Number(x) + dx] = parseInt(fill ?? '0', 16)
      }
    }
  }
  return grid
}

describe('rasterWords', () => {
  test('a 12 × 16 map is 12 columns by 8 rows of cells, three words a cell', () => {
    expect(rasterSize(MAP)).toEqual({ columns: 12, rows: 8 })
    expect(rasterWords(MAP, COLORS)).toHaveLength(12 * 8 * 3)
  })

  test('two filled pixels: upper half, top as foreground, bottom as background', () => {
    expect(rasterWords(['a', 'b'], { a: 0x112233, b: 0x445566 })).toEqual([0x2580, 0x112233, 0x445566])
  })

  test('an empty top uses the lower half, so nothing is painted in the default foreground', () => {
    expect(rasterWords(['.', 'b'], { b: 0x445566 })).toEqual([0x2584, 0x445566, DEFAULT_COLOR])
  })

  test('an empty bottom keeps the default background', () => {
    expect(rasterWords(['a', '.'], { a: 0x112233 })).toEqual([0x2580, 0x112233, DEFAULT_COLOR])
  })

  test('an empty cell is a space on the default colours, and an odd last row has an empty bottom', () => {
    expect(rasterWords(['.'], {})).toEqual([0x20, DEFAULT_COLOR, DEFAULT_COLOR])
  })
})

describe('toBase64', () => {
  test('matches the standard alphabet and padding', () => {
    const bytes = (s: string) => new Uint8Array([...s].map(c => c.charCodeAt(0)))
    expect(toBase64(bytes('Man'))).toBe('TWFu')
    expect(toBase64(bytes('Ma'))).toBe('TWE=')
    expect(toBase64(bytes('M'))).toBe('TQ==')
    expect(toBase64(new Uint8Array([0xfb, 0xff]))).toBe('+/8=')
    expect(toBase64(new Uint8Array([]))).toBe('')
  })
})

describe('toRasterCells', () => {
  test('little-endian words: one orange cell, as the types example has it', () => {
    // The types' own example: Uint32Array.of(0x2588, 0xff8800, 0x01000000), base64.
    expect(toBase64(new Uint8Array(new Uint32Array([0x2588, 0xff8800, 0x01000000]).buffer))).toBe('iCUAAACI/wAAAAAB')
    expect(toRasterCells(['a', 'a'], { a: 0xff8800 })).toBe('gCUAAACI/wAAiP8A')
  })

  test('the map encodes to 96 cells of 12 bytes', () => {
    expect(toRasterCells(MAP, COLORS)).toHaveLength(Math.ceil((96 * 12) / 3) * 4)
  })
})

describe('toSvg', () => {
  test('its rectangles paint back exactly the map\'s pixels, and nothing runs', () => {
    const svg = toSvg(MAP, COLORS)
    expect(paint(svg, 12, 16)).toEqual(mapToGrid(MAP, COLORS))
    expect(svg.replace(/<rect [^>]*\/>/g, '')).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 16" shape-rendering="crispEdges"></svg>')
    expect(svg.includes('<script')).toBe(false)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 16"')).toBe(true)
  })

  test('colours are six hex digits', () => {
    expect(toSvg(['a'], { a: 0x0000ff })).toContain('fill="#0000ff"')
  })
})

describe('the grid', () => {
  const grid: Grid = [
    [0x111111, 0x111111, undefined],
    [0x222222, undefined, 0x333333],
    [undefined, undefined, 0x444444],
  ]

  test('a map becomes a grid through its palette; unknown characters are empty', () => {
    expect(mapToGrid(['ab.', 'x'], { a: 1, b: 2 })).toEqual([[1, 2, undefined], [undefined]])
  })

  test('size: one column per pixel, two pixel rows per cell row, an odd last row rounded up', () => {
    expect(gridSize(grid)).toEqual({ columns: 3, rows: 2 })
    expect(gridSize([])).toEqual({ columns: 0, rows: 0 })
  })

  test('gridWords halves the rows and keeps empty halves on the default colour', () => {
    expect(gridWords(grid)).toEqual([
      0x2580, 0x111111, 0x222222,
      0x2580, 0x111111, DEFAULT_COLOR,
      0x2584, 0x333333, DEFAULT_COLOR,
      0x20, DEFAULT_COLOR, DEFAULT_COLOR,
      0x20, DEFAULT_COLOR, DEFAULT_COLOR,
      0x2580, 0x444444, DEFAULT_COLOR,
    ])
  })

  test('the map-based functions give exactly what the grid ones give', () => {
    const avatar = mapToGrid(MAP, COLORS)
    expect(rasterWords(MAP, COLORS)).toEqual(gridWords(avatar))
    expect(toRasterCells(MAP, COLORS)).toBe(gridToRasterCells(avatar))
    expect(toSvg(MAP, COLORS)).toBe(gridToSvg(avatar))
  })

  test('a run of one colour is one rectangle, and paints back the same pixels', () => {
    const wide: Grid = [Array<number | undefined>(200).fill(0x123456), Array<number | undefined>(200).fill(undefined)]
    const svg = gridToSvg(wide)
    expect(svg.split('<rect ').length - 1).toBe(1)
    expect(paint(svg, 200, 2)).toEqual(wide)
    expect(paint(gridToSvg(grid), 3, 3)).toEqual(grid)
  })
})

describe('the image output', () => {
  /** base64 back to bytes, for checking what gridToRgba wrote. */
  const bytes = (b64: string): number[] => {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    const out: number[] = []
    const clean = b64.replace(/=+$/, '')
    for (let i = 0; i < clean.length; i += 4) {
      const n = [0, 1, 2, 3].map(k => alphabet.indexOf(clean[i + k] ?? 'A'))
      const triple = ((n[0] ?? 0) << 18) | ((n[1] ?? 0) << 12) | ((n[2] ?? 0) << 6) | (n[3] ?? 0)
      out.push((triple >> 16) & 255)
      if (i + 2 < clean.length) out.push((triple >> 8) & 255)
      if (i + 3 < clean.length) out.push(triple & 255)
    }
    return out
  }

  test('a 2×1 grid at scale 2 is 4×2 pixels, each a 2×2 square, opaque', () => {
    const image = gridToRgba([[0x112233, 0x445566]], 2)
    expect([image.width, image.height]).toEqual([4, 2])
    const row = [0x11, 0x22, 0x33, 255, 0x11, 0x22, 0x33, 255, 0x44, 0x55, 0x66, 255, 0x44, 0x55, 0x66, 255]
    expect(bytes(image.rgba)).toEqual([...row, ...row])
  })

  test('an empty pixel is fully transparent', () => {
    expect(bytes(gridToRgba([[undefined, 0xffffff]], 1).rgba)).toEqual([0, 0, 0, 0, 255, 255, 255, 255])
  })

  test('an empty grid is one transparent pixel', () => {
    const image = gridToRgba([], 3)
    expect([image.width, image.height]).toEqual([1, 1])
    expect(bytes(image.rgba)).toEqual([0, 0, 0, 0])
  })

  test('the scale keeps within 2 MiB and 2048 pixels a side', () => {
    expect(imageScale(255, 28)).toBe(4)
    expect(imageScale(600, 28)).toBe(3)
    expect(imageScale(400, 400)).toBe(1)
    for (const [w, h] of [[255, 28], [600, 28], [120, 28], [1000, 300]] as const) {
      const s = imageScale(w, h)
      expect(w * s * h * s * 4 <= IMAGE_BYTES || s === 1).toBe(true)
      expect(w * s <= 2048 || s === 1).toBe(true)
    }
  })
})

describe('quadrantWords: two by two pixels a cell, in two colours', () => {
  const A = 0x112233
  const B = 0x445566

  test('the sixteen characters, by the pattern of top-left 1, top-right 2, bottom-left 4, bottom-right 8', () => {
    expect(QUADRANT).toEqual([
      0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b,
      0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588,
    ])
  })

  test('every pattern of two colours: the ink is the top-left pixel\'s colour, the pattern its pixels', () => {
    for (let p = 1; p < 15; p++) {
      const at = (bit: number) => (p & bit ? A : B)
      const words = quadrantWords([[at(1), at(2)], [at(4), at(8)]])
      // A block whose top-left is B draws B as the ink, with the other pixels as its pattern.
      const expected = p & 1 ? [QUADRANT[p], A, B] : [QUADRANT[~p & 15], B, A]
      expect(words).toEqual(expected)
    }
  })

  test('a block of one colour is a full block; an empty block is a space on the default colours', () => {
    expect(quadrantWords([[A, A], [A, A]])).toEqual([0x2588, A, A])
    expect(quadrantWords([[undefined, undefined], [undefined, undefined]])).toEqual([0x20, DEFAULT_COLOR, DEFAULT_COLOR])
  })

  test('an empty pixel is the terminal\'s own background, never the ink', () => {
    expect(quadrantWords([[A, undefined], [undefined, undefined]])).toEqual([0x2598, A, DEFAULT_COLOR])
    expect(quadrantWords([[undefined, A], [A, A]])).toEqual([0x259f, A, DEFAULT_COLOR])
  })

  test('more than two colours: the two most common stay, every other folds into the nearer', () => {
    const nearB = 0x445567
    const nearA = 0x112234
    // A at top-left and bottom-right, B top-right, a colour near B bottom-left: that one becomes B.
    expect(quadrantWords([[A, B], [nearB, A]])).toEqual([0x259a, A, B])
    // A twice, B once, a colour near A once: three pixels of A.
    expect(quadrantWords([[A, A], [B, nearA]])).toEqual([0x259c, A, B])
  })

  test('cells across and down, every code point in the BMP; an odd edge counts as empty', () => {
    const grid = Array.from({ length: 5 }, (_, y) => Array.from({ length: 6 }, (_, x) => ((x * 7 + y * 13) % 4) * 0x333333))
    const words = quadrantWords(grid)
    expect(words).toHaveLength(3 * 3 * 3)
    expect(words.filter((_, i) => i % 3 === 0).every(cp => QUADRANT.includes(cp) && cp <= 0xffff)).toBe(true)
    expect(gridToQuadrantCells([[A, A], [A, A]])).toBe(gridToQuadrantCells([[A, A], [A, A]]))
    expect(gridToQuadrantCells([[A, A], [A, A]])).toHaveLength(16)
  })
})
