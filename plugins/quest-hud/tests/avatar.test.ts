import { describe, expect, test } from 'claude-code/testing'

import { AVATAR, AVATAR_SMALL, DEFAULT_COLOR, MAGE, rasterSize, rasterWords, toBase64, toRasterCells, toSvg } from '../src/avatar'

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
  test('one rectangle per filled pixel and nothing that runs', () => {
    const svg = toSvg(AVATAR, MAGE)
    const filled = AVATAR.join('').split('').filter(c => c !== '.').length
    expect(svg.split('<rect ').length - 1).toBe(filled)
    expect(svg.includes('<script')).toBe(false)
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 16"')).toBe(true)
  })

  test('colours are six hex digits', () => {
    expect(toSvg(['a'], { a: 0x0000ff })).toContain('fill="#0000ff"')
  })
})
