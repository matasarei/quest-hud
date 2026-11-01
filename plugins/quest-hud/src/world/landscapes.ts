// Each zone's landscape, drawn in code: a sky (or a wall), a glow, three
// silhouette layers from far to near, and the ground. While the wizard walks
// the layers step past at different speeds — far 1, middle 2, near 4 units a
// step — so the road has depth. Shapes repeat across the width from the
// world's own x, so a step only moves them. Pure.
import type { Zone } from '../../types'
import type { Picture, Shape } from '../paint/picture'
import { INK, ZONE_PALETTE, type ZonePalette } from './palette'

/** The ground line, in units from the top: figures stand on it. */
export const GROUND = 24
/** The scene's height in units: fourteen rows of two. */
export const HEIGHT = 28
/** How many units a layer moves a step, far to near. */
export const PARALLAX = { far: 1, mid: 2, near: 4 } as const

/** A smooth, repeatable wobble for heights: the same world x always gives the same value. */
const wave = (x: number, seed: number): number =>
  0.55 * Math.sin(x / 9.7 + seed) + 0.3 * Math.sin(x / 4.3 + seed * 1.7) + 0.15 * Math.sin(x / 2.1 + seed * 3.1)

/** A skyline from x = 0 to `columns`, its world x shifted by `offset`. */
const ridge = (columns: number, offset: number, base: number, amp: number, seed: number, fill: number, opacity?: number): Shape => {
  const dx = 2
  const start = -(((offset % dx) + dx) % dx) - dx
  const count = Math.ceil((columns - start) / dx) + 2
  return {
    kind: 'ridge', x0: start, dx, bottom: GROUND + 0.5, fill,
    ys: Array.from({ length: count }, (_, i) => base - amp * wave(start + i * dx + offset, seed)),
    ...(opacity === undefined ? {} : { opacity }),
  }
}

/** Something every `spacing` units of world x, drawn at its place on screen. */
const every = (columns: number, offset: number, spacing: number, draw: (x: number, index: number) => Shape[]): Shape[] => {
  const shapes: Shape[] = []
  const first = Math.floor((offset - spacing) / spacing)
  for (let i = first; i * spacing - offset < columns + spacing; i++) shapes.push(...draw(i * spacing - offset, i))
  return shapes
}

const sky = (columns: number, p: ZonePalette): Shape =>
  ({ kind: 'rect', x: 0, y: 0, w: columns, h: GROUND + 0.5, fill: { top: p.skyTop, bottom: p.skyBottom, y0: 0, y1: GROUND } })

const ground = (columns: number, p: ZonePalette): Shape[] => [
  { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: { top: p.groundTop, bottom: p.groundBottom, y0: GROUND, y1: HEIGHT } },
  { kind: 'rect', x: 0, y: GROUND, w: columns, h: 0.4, fill: INK.cream, opacity: 0.08 },
]

/** A soft light: rings fading outward, so it has no hard edge. */
const glow = (cx: number, cy: number, color: number, size: number): Shape[] =>
  [2.6, 2, 1.5, 1.1, 0.75].map((k): Shape => ({ kind: 'ellipse', cx, cy, rx: size * k, ry: size * k * 0.8, fill: color, opacity: 0.045 }))

const pine = (x: number, color: number, height: number): Shape[] => [
  { kind: 'rect', x: x - 0.4, y: GROUND - 1.5, w: 0.8, h: 1.5, fill: color },
  { kind: 'polygon', points: [[x - 3, GROUND - 1.5], [x + 3, GROUND - 1.5], [x, GROUND - height]], fill: color },
  { kind: 'polygon', points: [[x - 2.3, GROUND - height * 0.45], [x + 2.3, GROUND - height * 0.45], [x, GROUND - height - 1.5]], fill: color },
]

const roundTree = (x: number, color: number, height: number): Shape[] => [
  { kind: 'rect', x: x - 0.5, y: GROUND - height * 0.5, w: 1, h: height * 0.5, fill: color },
  { kind: 'ellipse', cx: x, cy: GROUND - height * 0.68, rx: height * 0.42, ry: height * 0.36, fill: color },
]

/** The Wilds: a moon, far mountains, rolling hills, and trees close by. */
const wilds = (columns: number, step: number, p: ZonePalette): Shape[] => [
  sky(columns, p),
  ...glow(columns * 0.78, 6, p.glow, 6),
  { kind: 'ellipse', cx: columns * 0.78, cy: 6, rx: 2.2, ry: 2.2, fill: p.glow, opacity: 0.85 },
  ridge(columns, step * PARALLAX.far, 14, 4, 1, p.far),
  ridge(columns, step * PARALLAX.mid, 19, 2.2, 2, p.mid),
  ...every(columns, step * PARALLAX.near, 23, (x, i) => (i % 3 === 1 ? roundTree(x, p.near, 9 + (i % 2) * 2) : pine(x, p.near, 10 + (i % 2) * 3))),
  ridge(columns, step * PARALLAX.near, 23, 0.6, 3, p.near),
  ...ground(columns, p),
]

/** The Map room: a long library — shelves of books behind, arched night windows, warm lamps. */
const mapRoom = (columns: number, step: number, p: ZonePalette): Shape[] => {
  const spines = [0x6b3b2e, 0x3f4f5e, 0x6e5a33, 0x4d3a52, 0x5a2f2a]
  return [
    sky(columns, p),
    ...every(columns, step * PARALLAX.far, 26, (x, i) => [
      { kind: 'rect', x, y: 2, w: 20, h: GROUND - 2, fill: p.far },
      ...[0, 1, 2, 3].flatMap(row =>
        Array.from({ length: 8 }, (_, k): Shape => ({
          kind: 'rect', x: x + 1.2 + k * 2.2, y: 3.5 + row * 5 + ((k + i) % 3) * 0.5, w: 1.6, h: 4 - ((k + i) % 3) * 0.5,
          fill: spines[(k + row + i) % spines.length] as number, opacity: 0.55,
        })),
      ),
    ]),
    ...every(columns, step * PARALLAX.mid, 44, (x) => [
      { kind: 'rect', x: x - 0.8, y: 4.2, w: 11.6, h: 13.8, fill: p.mid },
      { kind: 'ellipse', cx: x + 5, cy: 6.4, rx: 5, ry: 4.2, fill: 0x1d2a44 },
      { kind: 'rect', x, y: 6.4, w: 10, h: 10.8, fill: { top: 0x1d2a44, bottom: 0x2b3a58, y0: 6, y1: 17 } },
      { kind: 'rect', x: x + 4.6, y: 3, w: 0.8, h: 15, fill: p.mid },
      { kind: 'ellipse', cx: x + 7.5, cy: 7, rx: 1.1, ry: 1.1, fill: INK.cream, opacity: 0.7 },
    ]),
    ...every(columns, step * PARALLAX.near, 48, (x) => [
      ...glow(x, 9, p.glow, 4),
      { kind: 'capsule', x1: x, y1: 0, x2: x, y2: 7.5, r: 0.2, fill: p.near },
      { kind: 'polygon', points: [[x - 1.8, 9.5], [x + 1.8, 9.5], [x + 0.9, 7.5], [x - 0.9, 7.5]], fill: p.near },
      { kind: 'ellipse', cx: x, cy: 9.8, rx: 1, ry: 0.6, fill: p.glow },
    ]),
    ...ground(columns, p),
    ...every(columns, step * PARALLAX.near, 7, (x) => [{ kind: 'rect', x, y: GROUND + 0.3, w: 0.3, h: HEIGHT - GROUND, fill: INK.slate, opacity: 0.25 }]),
  ]
}

/** The Forge: chimney stacks and smoke behind, furnace mouths aglow, anvils and sparks close by. */
const forge = (columns: number, step: number, p: ZonePalette): Shape[] => [
  sky(columns, p),
  ...every(columns, step * PARALLAX.far, 17, (x, i) => {
    const top = 4 + (i % 3) * 2.5
    return [
      { kind: 'rect', x, y: top, w: 4, h: GROUND - top, fill: p.far },
      { kind: 'ellipse', cx: x + 2 + (step % 4) * 0.3, cy: top - 2, rx: 3, ry: 1.6, fill: INK.cloudy, opacity: 0.08 },
      { kind: 'ellipse', cx: x + 3.5 + (step % 4) * 0.5, cy: top - 4.5, rx: 4, ry: 2, fill: INK.cloudy, opacity: 0.05 },
    ]
  }),
  ridge(columns, step * PARALLAX.mid, 19, 1.4, 4, p.mid),
  ...every(columns, step * PARALLAX.mid, 52, (x) => [
    ...glow(x + 6, 17, p.glow, 6),
    { kind: 'rect', x, y: 12, w: 12, h: 12, fill: p.mid },
    { kind: 'ellipse', cx: x + 6, cy: 18, rx: 4, ry: 3.6, fill: { top: INK.glowGold, bottom: INK.crail, y0: 15, y1: 21.6 } },
  ]),
  ...every(columns, step * PARALLAX.near, 33, (x, i) => [
    { kind: 'polygon', points: [[x - 3.5, 18.5], [x + 4.5, 18.5], [x + 3, 20], [x + 1.2, 20], [x + 1.2, 22.5], [x + 3, GROUND], [x - 2, GROUND], [x - 0.2, 22.5], [x - 0.2, 20], [x - 2, 20]], fill: p.near },
    ...[0, 1, 2].map((k): Shape => ({
      kind: 'ellipse', cx: x + ((i * 7 + k * 5 + step * 3) % 9) - 4, cy: 17.5 - ((k * 3 + step * 2 + i) % 7), rx: 0.35, ry: 0.35, fill: INK.glowGold, opacity: 0.85,
    })),
  ]),
  ...ground(columns, p),
]

/**
 * The zone's landscape `columns` units wide, `step` steps into the walk (0
 * when still). Zones not drawn yet borrow the Wilds' shapes in their own colours.
 */
export const landscape = (zone: Zone, columns: number, step = 0): Picture => {
  const p = ZONE_PALETTE[zone]
  switch (zone) {
    case 'map':
      return mapRoom(columns, step, p)
    case 'forge':
      return forge(columns, step, p)
    default:
      return wilds(columns, step, p)
  }
}
