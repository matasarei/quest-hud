// Pixels to a PNG file, base64, for an Image's `{ png }` source: a frame of
// smooth gradients compresses to a few percent of its raw bytes. Written
// here, because the runtime promises no zlib: RGB rows, a filter chosen per
// row, and deflate as LZ77 with the fixed Huffman codes (RFC 1950, 1951).
// Pure, synchronous and deterministic.
import { toBase64 } from '../avatar'
import type { Rgb } from './raster'

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

/** CRC-32 of `bytes`, as PNG chunks carry it. */
export const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff
  for (const byte of bytes) c = (CRC_TABLE[(c ^ byte) & 255] as number) ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Adler-32 of `bytes`, as zlib streams end with it. */
export const adler32 = (bytes: Uint8Array): number => {
  let a = 1
  let b = 0
  for (let i = 0; i < bytes.length; i++) {
    a = (a + (bytes[i] as number)) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** Bits out, least significant first, into a growing byte buffer. */
class Bits {
  private out = new Uint8Array(1 << 16)
  private length = 0
  private buffer = 0
  private count = 0

  write(value: number, bits: number): void {
    this.buffer |= value << this.count
    this.count += bits
    while (this.count >= 8) {
      this.push(this.buffer & 255)
      this.buffer >>>= 8
      this.count -= 8
    }
  }

  /** A Huffman code: its bits go out most significant first. */
  code(value: number, bits: number): void {
    let reversed = 0
    for (let i = 0; i < bits; i++) reversed |= ((value >> i) & 1) << (bits - 1 - i)
    this.write(reversed, bits)
  }

  bytes(): Uint8Array {
    if (this.count > 0) this.push(this.buffer & 255)
    this.buffer = 0
    this.count = 0
    return this.out.slice(0, this.length)
  }

  private push(byte: number): void {
    if (this.length === this.out.length) {
      const grown = new Uint8Array(this.out.length * 2)
      grown.set(this.out)
      this.out = grown
    }
    this.out[this.length++] = byte
  }
}

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DISTANCE_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]

/** A literal or length symbol in the fixed Huffman code. */
const symbol = (bits: Bits, value: number): void => {
  if (value < 144) bits.code(0x30 + value, 8)
  else if (value < 256) bits.code(0x190 + value - 144, 9)
  else if (value < 280) bits.code(value - 256, 7)
  else bits.code(0xc0 + value - 280, 8)
}

/** The index of the last base not above `value`. */
const bucket = (bases: readonly number[], value: number): number => {
  let i = bases.length - 1
  while ((bases[i] as number) > value) i--
  return i
}

const WINDOW = 32768
const MIN_MATCH = 3
const MAX_MATCH = 258
const CHAIN = 24

/** `data` as one fixed-Huffman deflate block, LZ77 matches found through a hash chain. */
export const deflate = (data: Uint8Array): Uint8Array => {
  const bits = new Bits()
  bits.write(1, 1)
  bits.write(1, 2)

  const head = new Int32Array(1 << 15).fill(-1)
  const previous = new Int32Array(WINDOW).fill(-1)
  const hash = (i: number): number => (((data[i] as number) << 10) ^ ((data[i + 1] as number) << 5) ^ (data[i + 2] as number)) & 0x7fff
  const insert = (i: number): void => {
    if (i + 2 >= data.length) return
    const h = hash(i)
    previous[i % WINDOW] = head[h] as number
    head[h] = i
  }

  let i = 0
  while (i < data.length) {
    let bestLength = 0
    let bestDistance = 0

    if (i + MIN_MATCH <= data.length) {
      let candidate = head[hash(i)] as number
      for (let tries = 0; candidate >= 0 && i - candidate <= WINDOW && tries < CHAIN; tries++) {
        let length = 0
        const most = Math.min(MAX_MATCH, data.length - i)
        while (length < most && data[candidate + length] === data[i + length]) length++
        if (length > bestLength) {
          bestLength = length
          bestDistance = i - candidate
          if (length === most) break
        }
        const next = previous[candidate % WINDOW] as number
        if (next >= candidate) break
        candidate = next
      }
    }

    if (bestLength >= MIN_MATCH) {
      const l = bucket(LENGTH_BASE, bestLength)
      symbol(bits, 257 + l)
      bits.write(bestLength - (LENGTH_BASE[l] as number), LENGTH_EXTRA[l] as number)
      const d = bucket(DISTANCE_BASE, bestDistance)
      bits.code(d, 5)
      bits.write(bestDistance - (DISTANCE_BASE[d] as number), DISTANCE_EXTRA[d] as number)
      for (let k = 0; k < bestLength; k++) insert(i + k)
      i += bestLength
    } else {
      symbol(bits, data[i] as number)
      insert(i)
      i++
    }
  }

  symbol(bits, 256)
  return bits.bytes()
}

/** `data` as a zlib stream: header, deflate, Adler-32. */
export const zlib = (data: Uint8Array): Uint8Array => {
  const body = deflate(data)
  const out = new Uint8Array(body.length + 6)
  out[0] = 0x78
  out[1] = 0x01
  out.set(body, 2)
  const sum = adler32(data)
  out[out.length - 4] = sum >>> 24
  out[out.length - 3] = (sum >>> 16) & 255
  out[out.length - 2] = (sum >>> 8) & 255
  out[out.length - 1] = sum & 255
  return out
}

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
}

/** Each row with the filter (none, sub, up, paeth) that leaves the smallest bytes, its type first. */
const filterRows = ({ width, height, data }: Rgb): Uint8Array => {
  const stride = width * 3
  const out = new Uint8Array(height * (stride + 1))
  const candidate = new Uint8Array(stride)

  for (let y = 0; y < height; y++) {
    const row = y * stride
    let bestType = 0
    let bestScore = Infinity
    let best = data.subarray(row, row + stride)

    for (const type of [0, 1, 2, 4]) {
      let score = 0
      for (let x = 0; x < stride; x++) {
        const raw = data[row + x] as number
        const left = x >= 3 ? (data[row + x - 3] as number) : 0
        const up = y > 0 ? (data[row - stride + x] as number) : 0
        const corner = x >= 3 && y > 0 ? (data[row - stride + x - 3] as number) : 0
        const predicted = type === 0 ? 0 : type === 1 ? left : type === 2 ? up : paeth(left, up, corner)
        const value = (raw - predicted) & 255
        candidate[x] = value
        score += value < 128 ? value : 256 - value
      }
      if (score < bestScore) {
        bestScore = score
        bestType = type
        best = candidate.slice()
      }
    }

    out[y * (stride + 1)] = bestType
    out.set(best, y * (stride + 1) + 1)
  }

  return out
}

const chunk = (type: string, body: Uint8Array): Uint8Array => {
  const out = new Uint8Array(body.length + 12)
  const view = new DataView(out.buffer)
  view.setUint32(0, body.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(body, 8)
  view.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length)))
  return out
}

/** The pixels as the bytes of a PNG file: 8-bit RGB, no interlace. */
export const pngBytes = (rgb: Rgb): Uint8Array => {
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, rgb.width)
  view.setUint32(4, rgb.height)
  header[8] = 8
  header[9] = 2
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', zlib(filterRows(rgb))),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** An Image's `{ png }` source: the file, base64. */
export const encodePng = (rgb: Rgb): string => toBase64(pngBytes(rgb))
