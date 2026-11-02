import { describe, expect, test } from 'claude-code/testing'

import { contains, mirror, translate, type Picture } from '../src/paint/picture'
import { adler32, crc32, deflate, pngBytes } from '../src/paint/png'
import { bayer, ditherBand, downsample, gridToRgb, mirrorGrid, spriteGrid, stamp, type Canvas } from '../src/paint/pixels'
import { rasterize, rgbToGrid, type Rgb } from '../src/paint/raster'
import { pictureToSvg } from '../src/paint/svg'
import { fnv1a } from './measure'

// A test-only inflate for what the encoder writes: stored and fixed-Huffman blocks.
const inflate = (data: Uint8Array): Uint8Array => {
  let at = 0
  let bit = 0
  const read = (n: number): number => {
    let value = 0
    for (let i = 0; i < n; i++) {
      value |= (((data[at] as number) >> bit) & 1) << i
      if (++bit === 8) {
        bit = 0
        at++
      }
    }
    return value
  }
  const LB = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
  const LE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
  const DB = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
  const DE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
  const out: number[] = []
  const literal = (): number => {
    let code = 0
    for (let len = 1; len <= 9; len++) {
      code = (code << 1) | read(1)
      if (len === 7 && code <= 23) return 256 + code
      if (len === 8 && code >= 0x30 && code <= 0xbf) return code - 0x30
      if (len === 8 && code >= 0xc0 && code <= 0xc7) return 280 + code - 0xc0
      if (len === 9 && code >= 0x190) return 144 + code - 0x190
    }
    throw new Error('bad code')
  }
  let last = 0
  while (!last) {
    last = read(1)
    const type = read(2)
    if (type === 0) {
      if (bit) {
        bit = 0
        at++
      }
      const len = (data[at] as number) | ((data[at + 1] as number) << 8)
      at += 4
      for (let i = 0; i < len; i++) out.push(data[at++] as number)
    } else if (type === 1) {
      for (;;) {
        const sym = literal()
        if (sym < 256) out.push(sym)
        else if (sym === 256) break
        else {
          const l = sym - 257
          const length = (LB[l] as number) + read(LE[l] as number)
          let d = 0
          for (let i = 0; i < 5; i++) d = (d << 1) | read(1)
          const distance = (DB[d] as number) + read(DE[d] as number)
          for (let i = 0; i < length; i++) out.push(out[out.length - distance] as number)
        }
      }
    } else throw new Error(`block type ${type}`)
  }
  return new Uint8Array(out)
}

/** The PNG's chunks, each CRC checked, and its pixels unfiltered. */
const decodePng = (file: Uint8Array): { width: number; height: number; pixels: Uint8Array; types: string[] } => {
  expect([...file.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const types: string[] = []
  let width = 0
  let height = 0
  const idat: number[] = []
  for (let at = 8; at < file.length;) {
    const length = view.getUint32(at)
    const type = String.fromCharCode(...file.subarray(at + 4, at + 8))
    const body = file.subarray(at + 8, at + 8 + length)
    expect(view.getUint32(at + 8 + length)).toBe(crc32(file.subarray(at + 4, at + 8 + length)))
    types.push(type)
    if (type === 'IHDR') {
      width = view.getUint32(at + 8)
      height = view.getUint32(at + 12)
      expect([body[8], body[9], body[12]]).toEqual([8, 2, 0])
    }
    if (type === 'IDAT') idat.push(...body)
    at += 12 + length
  }
  const stream = new Uint8Array(idat)
  expect([stream[0], stream[1]]).toEqual([0x78, 0x01])
  const raw = inflate(stream.subarray(2, stream.length - 4))
  const tail = stream.subarray(stream.length - 4)
  expect(((tail[0]! << 24) | (tail[1]! << 16) | (tail[2]! << 8) | tail[3]!) >>> 0).toBe(adler32(raw))
  const stride = width * 3
  const pixels = new Uint8Array(height * stride)
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)] as number
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x] as number
      const a = x >= 3 ? (pixels[y * stride + x - 3] as number) : 0
      const b = y > 0 ? (pixels[(y - 1) * stride + x] as number) : 0
      const c = x >= 3 && y > 0 ? (pixels[(y - 1) * stride + x - 3] as number) : 0
      const p = a + b - c
      const pred = type === 0 ? 0 : type === 1 ? a : type === 2 ? b : type === 3 ? (a + b) >> 1
        : Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c
      pixels[y * stride + x] = (value + pred) & 255
    }
  }
  return { width, height, pixels, types }
}

describe('shapes', () => {
  test('what each kind contains', () => {
    expect(contains({ kind: 'rect', x: 0, y: 0, w: 2, h: 1, fill: 0 }, 1.9, 0.5)).toBe(true)
    expect(contains({ kind: 'rect', x: 0, y: 0, w: 2, h: 1, fill: 0 }, 2, 0.5)).toBe(false)
    expect(contains({ kind: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, fill: 0 }, 1.9, 0)).toBe(true)
    expect(contains({ kind: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, fill: 0 }, 1.5, 0.8)).toBe(false)
    const triangle = { kind: 'polygon', points: [[0, 0], [4, 0], [0, 4]], fill: 0 } as const
    expect(contains(triangle, 1, 1)).toBe(true)
    expect(contains(triangle, 3, 3)).toBe(false)
    expect(contains({ kind: 'capsule', x1: 0, y1: 0, x2: 10, y2: 0, r: 1, fill: 0 }, 5, 0.9)).toBe(true)
    expect(contains({ kind: 'capsule', x1: 0, y1: 0, x2: 10, y2: 0, r: 1, fill: 0 }, 11.5, 0)).toBe(false)
    const ridge = { kind: 'ridge', x0: 0, dx: 10, ys: [10, 0], bottom: 20, fill: 0 } as const
    expect(contains(ridge, 5, 6)).toBe(true)
    expect(contains(ridge, 5, 4)).toBe(false)
    expect(contains(ridge, 5, 21)).toBe(false)
  })

  test('translate moves shapes and their gradients; mirror flips about an axis', () => {
    const [moved] = translate([{ kind: 'rect', x: 1, y: 2, w: 3, h: 4, fill: { top: 0, bottom: 1, y0: 2, y1: 6 } }], 10, 20)
    expect(moved).toEqual({ kind: 'rect', x: 11, y: 22, w: 3, h: 4, fill: { top: 0, bottom: 1, y0: 22, y1: 26 } })
    expect(mirror([{ kind: 'rect', x: 1, y: 0, w: 3, h: 1, fill: 0 }], 10)).toEqual([{ kind: 'rect', x: 16, y: 0, w: 3, h: 1, fill: 0 }])
    expect(mirror([{ kind: 'ridge', x0: 0, dx: 5, ys: [1, 2, 3], bottom: 9, fill: 0 }], 10))
      .toEqual([{ kind: 'ridge', x0: 10, dx: 5, ys: [3, 2, 1], bottom: 9, fill: 0 }])
  })
})

describe('rasterize', () => {
  test('a shape covering half a pixel mixes half its colour in', () => {
    const half = rasterize([{ kind: 'rect', x: 0, y: 0, w: 0.5, h: 1, fill: 0xffffff }], 1, 1, 1, 0)
    const whole = rasterize([{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: 0xffffff }], 1, 1, 1, 0)
    expect(half.data[0]).toBe(128)
    expect(whole.data[0]).toBe(255)
  })

  test('opacity mixes, and the background shows where nothing is drawn', () => {
    const rgb = rasterize([{ kind: 'rect', x: 0, y: 0, w: 1, h: 1, fill: 0xffffff, opacity: 0.5 }], 2, 1, 1, 0x102030)
    expect([...rgb.data]).toEqual([136, 144, 152, 0x10, 0x20, 0x30])
  })

  test('a gradient runs from its top colour to its bottom colour', () => {
    const rgb = rasterize([{ kind: 'rect', x: 0, y: 0, w: 1, h: 28, fill: { top: 0x000000, bottom: 0xffffff, y0: 0, y1: 28 } }], 1, 28, 1)
    const reds = Array.from({ length: 28 }, (_, y) => rgb.data[y * 3] as number)
    expect(reds[0]! < 10).toBe(true)
    expect(reds[27]! > 245).toBe(true)
    expect(reds.every((v, i) => i === 0 || v >= reds[i - 1]!)).toBe(true)
  })

  test('a scale draws each unit as scale × scale pixels; scale 1 gives the cells\' grid', () => {
    const picture: Picture = [{ kind: 'rect', x: 1, y: 0, w: 1, h: 1, fill: 0xff0000 }]
    const big = rasterize(picture, 3, 2, 4)
    expect([big.width, big.height]).toEqual([12, 8])
    expect(rgbToGrid(rasterize(picture, 3, 2, 1))).toEqual([[0, 0xff0000, 0], [0, 0, 0]])
  })
})

describe('the PNG encoder', () => {
  const frame = (width: number, height: number, noise: boolean): Rgb => {
    const data = new Uint8Array(width * height * 3)
    let seed = 7
    for (let i = 0; i < data.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      data[i] = noise ? seed >>> 24 : Math.floor((i / 3 / width) * 2) & 255
    }
    return { width, height, data }
  }

  test('a valid PNG: signature, header, CRCs, zlib, and the same pixels back', () => {
    for (const rgb of [frame(37, 11, true), frame(64, 20, false), frame(1, 1, true)]) {
      const decoded = decodePng(pngBytes(rgb))
      expect(decoded.types).toEqual(['IHDR', 'IDAT', 'IEND'])
      expect([decoded.width, decoded.height]).toEqual([rgb.width, rgb.height])
      expect([...decoded.pixels]).toEqual([...rgb.data])
    }
  })

  test('deflate round-trips long repeats and empty input', () => {
    const long = new Uint8Array(70_000).map((_, i) => (i % 300) & 255)
    expect([...inflate(deflate(long))]).toEqual([...long])
    expect([...inflate(deflate(new Uint8Array(0)))]).toEqual([])
  })

  test('a frame of gradients and shapes compresses to a small file', () => {
    const picture: Picture = [
      { kind: 'rect', x: 0, y: 0, w: 120, h: 28, fill: { top: 0x1f1e2e, bottom: 0x3a2a3a, y0: 0, y1: 28 } },
      { kind: 'ellipse', cx: 90, cy: 9, rx: 20, ry: 14, fill: 0xd97757, opacity: 0.3 },
      { kind: 'ridge', x0: 0, dx: 4, ys: Array.from({ length: 31 }, (_, i) => 16 + 3 * Math.sin(i / 2)), bottom: 28, fill: 0x2b2638 },
      { kind: 'polygon', points: [[30, 24], [42, 24], [36, 8]], fill: 0xd97757 },
    ]
    const file = pngBytes(rasterize(picture, 120, 28, 4))
    expect(file.length < 40_000).toBe(true)
  })
})

describe('the Svg writer', () => {
  test('one element per shape, gradients shared, and the background first', () => {
    const fill = { top: 0x000000, bottom: 0xffffff, y0: 0, y1: 28 }
    const svg = pictureToSvg([
      { kind: 'rect', x: 0, y: 0, w: 10, h: 28, fill },
      { kind: 'rect', x: 10, y: 0, w: 10, h: 28, fill },
      { kind: 'capsule', x1: 0, y1: 0, x2: 5, y2: 5, r: 0.5, fill: 0x3d2a22 },
      { kind: 'ridge', x0: 0, dx: 10, ys: [5, 6], bottom: 28, fill: 0x123456, opacity: 0.5 },
    ], 20, 28, 0x1f1e1d)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg.match(/<linearGradient/g)?.length).toBe(1)
    expect(svg.match(/<rect /g)?.length).toBe(3)
    expect(svg.includes('stroke-linecap="round"')).toBe(true)
    expect(svg.includes('fill-opacity="0.5"')).toBe(true)
    expect(svg.indexOf('fill="#1f1e1d"') < svg.indexOf('url(#g0)')).toBe(true)
  })
})

describe('pixel art', () => {
  test('hard edges: a pixel is the shape\'s colour or not at all', () => {
    const narrow = rasterize([{ kind: 'rect', x: 0, y: 0, w: 0.4, h: 1, fill: 0xffffff }], 1, 1, 1, 0, { pixel: true })
    const wide = rasterize([{ kind: 'rect', x: 0, y: 0, w: 0.6, h: 1, fill: 0xffffff }], 1, 1, 1, 0, { pixel: true })
    expect([narrow.data[0], wide.data[0]]).toEqual([0, 255])
  })

  test('a gradient is a few flat bands dithered into each other, darkest at its top', () => {
    const fill = { top: 0x000000, bottom: 0xffffff, y0: 0, y1: 32 }
    const rgb = rasterize([{ kind: 'rect', x: 0, y: 0, w: 8, h: 32, fill }], 8, 32, 1, 0, { pixel: true, bands: 5 })
    const reds = Array.from({ length: 32 * 8 }, (_, i) => rgb.data[i * 3] as number)
    expect(new Set(reds).size <= 5).toBe(true)
    const rowMean = (y: number) => reds.slice(y * 8, y * 8 + 8).reduce((a, b) => a + b, 0) / 8
    expect(rowMean(0) < rowMean(16) && rowMean(16) < rowMean(31)).toBe(true)
  })

  test('half see-through is half the pixels of a block drawn, in the Bayer pattern', () => {
    const rgb = rasterize([{ kind: 'rect', x: 0, y: 0, w: 4, h: 4, fill: 0xffffff, opacity: 0.5 }], 4, 4, 1, 0, { pixel: true })
    const drawn = Array.from({ length: 16 }, (_, i) => rgb.data[i * 3]).filter(v => v === 255).length
    expect(drawn).toBe(8)
    expect(ditherBand(0.5, 3, 0, 0)).toBe(1)
    expect(bayer(0, 0) < bayer(1, 1)).toBe(true)
  })

  describe('for text cells, dithered in row pairs', () => {
    // A gradient and a see-through shape, both dithered in pixel mode.
    const picture: Picture = [
      { kind: 'rect', x: 0, y: 0, w: 40, h: 56, fill: { top: 0x204060, bottom: 0xe0f0ff, y0: 0, y1: 56 } },
      { kind: 'rect', x: 10, y: 20, w: 12, h: 12, fill: 0xffffff, opacity: 0.4 },
    ]
    const grid = (ditherRows?: number) =>
      rgbToGrid(rasterize(picture, 40, 56, 1, 0, { pixel: true, bands: 5, ...(ditherRows === undefined ? {} : { ditherRows }) }))
    /** Of the pixels that differ from their right neighbour, the share that match the one below: vertical stripes. */
    const striping = (g: ReadonlyArray<ReadonlyArray<number | undefined>>): number => {
      let mixed = 0
      let striped = 0
      for (let y = 0; y + 1 < g.length; y++) {
        for (let x = 0; x + 1 < (g[y]?.length ?? 0); x++) {
          if (g[y]?.[x] === g[y]?.[x + 1]) continue
          mixed++
          if (g[y]?.[x] === g[y + 1]?.[x]) striped++
        }
      }
      return striped / Math.max(1, mixed)
    }

    test('each pair of rows is the same, and the default is today\'s dither', () => {
      const paired = grid(2)
      for (let y = 0; y < paired.length; y += 2) expect(JSON.stringify(paired[y + 1])).toBe(JSON.stringify(paired[y]))
      // Today's dither, byte for byte: its fingerprint, taken from main before row pairs could change it.
      expect(fnv1a(JSON.stringify(grid()))).toBe('6181c3f1')
      expect(JSON.stringify(grid(1))).toBe(JSON.stringify(grid()))
      expect(JSON.stringify(grid(2)) === JSON.stringify(grid())).toBe(false)
    })

    test('with its rows halved, it stripes no more than the art; today\'s dither stripes', () => {
      expect(striping(downsample(grid(), 1, 2))).toBeGreaterThan(0.6)
      expect(striping(downsample(grid(2), 1, 2))).toBeLessThanOrEqual(striping(grid()) + 0.05)
    })
  })

  test('sprites: palette keys to colours, \'.\' to nothing; mirrored; stamped where it fits', () => {
    const sprite = { rows: ['a.', 'bb'], palette: { a: 0x111111, b: 0x222222 } }
    expect(spriteGrid(sprite)).toEqual([[0x111111, undefined], [0x222222, 0x222222]])
    expect(mirrorGrid(spriteGrid(sprite))).toEqual([[undefined, 0x111111], [0x222222, 0x222222]])
    const canvas: Canvas = [[0, 0, 0], [0, 0, 0]]
    stamp(canvas, spriteGrid(sprite), 2, 0)
    expect(canvas).toEqual([[0, 0, 0x111111], [0, 0, 0x222222]])
  })

  test('a stamp kept to columns writes nothing outside them; with none, the whole row', () => {
    const solid = [[7, 7, 7, 7]]
    const kept: Canvas = [[0, 0, 0, 0, 0, 0]]
    stamp(kept, solid, 1, 0, 2, 4)
    expect(kept).toEqual([[0, 0, 7, 7, 0, 0]])
    const whole: Canvas = [[0, 0, 0, 0, 0, 0]]
    stamp(whole, solid, 1, 0)
    expect(whole).toEqual([[0, 7, 7, 7, 7, 0]])
  })

  test('down by blocks keeps each block\'s most common colour; up by squares keeps every pixel', () => {
    expect(downsample([[1, 1], [1, 2]], 2)).toEqual([[1]])
    expect(downsample([[1, 2], [2, 1]], 2)).toEqual([[1]])
    expect(downsample([[1, 2, 3, 3], [2, 2, 3, 4]], 2)).toEqual([[2, 3]])
    // Rows only: columns kept, each pair of rows one row, the first seen of equals.
    expect(downsample([[1, 2], [1, 3], [4, 5], [6, 5]], 1, 2)).toEqual([[1, 2], [4, 5]])
    const rgb = gridToRgb([[0xff0000, 0x00ff00]], 2)
    expect([rgb.width, rgb.height]).toEqual([4, 2])
    expect([...rgb.data.slice(0, 12)]).toEqual([255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255, 0])
  })
})
