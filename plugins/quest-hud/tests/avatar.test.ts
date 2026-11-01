import { describe, expect, test } from 'claude-code/testing'

import {
  AVATAR, AVATAR_SMALL, DEFAULT_COLOR, gridSize, gridToRasterCells, gridToRgba, gridToSvg, gridWords, IMAGE_BYTES, imageScale,
  MAGE, mapToGrid, rasterSize, rasterWords, toBase64, toRasterCells, toSvg, type Grid,
} from '../src/avatar'

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

describe('the avatar map', () => {
  test('every row is as wide as the first', () => {
    expect(AVATAR.every(row => row.length === 12)).toBe(true)
    expect(AVATAR).toHaveLength(16)
    expect(AVATAR_SMALL.every(row => row.length === 6)).toBe(true)
    expect(AVATAR_SMALL).toHaveLength(6)
  })

  test('every pixel of both maps has a colour in the palette', () => {
    const missing = [...AVATAR, ...AVATAR_SMALL].join('').split('').filter(c => c !== '.' && MAGE[c] === undefined)
    expect(missing).toEqual([])
  })
})

describe('rasterWords', () => {
  test('12 columns by 8 rows, three words a cell', () => {
    expect(rasterSize(AVATAR)).toEqual({ columns: 12, rows: 8 })
    expect(rasterWords(AVATAR, MAGE)).toHaveLength(12 * 8 * 3)
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

  test('the avatar encodes to 96 cells of 12 bytes', () => {
    expect(toRasterCells(AVATAR, MAGE)).toHaveLength(Math.ceil((96 * 12) / 3) * 4)
  })
})

describe('toSvg', () => {
  test('its rectangles paint back exactly the avatar\'s pixels, and nothing runs', () => {
    const svg = toSvg(AVATAR, MAGE)
    expect(paint(svg, 12, 16)).toEqual(mapToGrid(AVATAR, MAGE))
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
    const avatar = mapToGrid(AVATAR, MAGE)
    expect(rasterWords(AVATAR, MAGE)).toEqual(gridWords(avatar))
    expect(toRasterCells(AVATAR, MAGE)).toBe(gridToRasterCells(avatar))
    expect(toSvg(AVATAR, MAGE)).toBe(gridToSvg(avatar))
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
