// Each zone's landscape, drawn in code and painted as pixel art: a sky (or a
// wall), three layers from far to near, and the ground. While the wizard
// walks, the layers step past at different speeds — far 1, middle 2, near 4
// units a step — so the road has depth. Shapes repeat across the width from
// the world's own x, so a step only moves them. Painted with hard edges, its
// gradients and see-through shapes dithered (rasterize's pixel mode). Pure.
import type { Zone } from '../../types'
import type { Picture, Shape } from '../paint/picture'
import { BOOKS, CASTLE, COBBLE, FIRE, GRASS, ROCK, SKY, STEEL, STONE, WOOD } from './palette'

/** The ground line, in units from the top: figures stand on it. */
export const GROUND = 24
/** The scene's height in units: fourteen rows of two. */
export const HEIGHT = 28
/** How many units a layer moves a step, far to near. */
export const PARALLAX = { far: 1, mid: 2, near: 4 } as const

/** A smooth, repeatable wobble: the same world x always gives the same value. */
const wave = (x: number, seed: number): number =>
  0.55 * Math.sin(x / 9.7 + seed) + 0.3 * Math.sin(x / 4.3 + seed * 1.7) + 0.15 * Math.sin(x / 2.1 + seed * 3.1)

/** A skyline from x = 0 to `columns`, its world x shifted by `offset`, filled down to the ground. */
const ridge = (columns: number, offset: number, base: number, amp: number, seed: number, fill: number): Shape => {
  const dx = 1
  const start = -(((offset % dx) + dx) % dx) - dx
  const count = Math.ceil(columns - start) + 2
  return { kind: 'ridge', x0: start, dx, bottom: GROUND + 0.5, fill, ys: Array.from({ length: count }, (_, i) => base - amp * wave(start + i + offset, seed)) }
}

/** Something every `spacing` units of world x, drawn at its place on screen. */
const every = (columns: number, offset: number, spacing: number, draw: (x: number, index: number) => Shape[]): Shape[] => {
  const shapes: Shape[] = []
  for (let i = Math.floor((offset - spacing * 2) / spacing); i * spacing - offset < columns + spacing; i++) shapes.push(...draw(i * spacing - offset, i))
  return shapes
}

/** A dithered light: rings, each more of its pixels lit toward the middle. */
const glow = (cx: number, cy: number, color: number, size: number): Shape[] =>
  [[1.25, 0.14], [0.85, 0.3]].map(([k, opacity]): Shape => ({ kind: 'ellipse', cx, cy, rx: size * k!, ry: size * k! * 0.8, fill: color, opacity }))

/** A snowy peak: a lit left face, a shaded right face, and a cap of snow with a jagged edge. */
const peak = (x: number, height: number, width: number): Shape[] => {
  const top = GROUND - 5 - height
  const base = GROUND - 4
  const snow = top + height * 0.38
  return [
    { kind: 'polygon', points: [[x - width, base], [x, top], [x, base]], fill: ROCK.lit },
    { kind: 'polygon', points: [[x, top], [x + width, base], [x, base]], fill: ROCK.shade },
    { kind: 'polygon', points: [[x, top], [x - width * 0.38, snow], [x - width * 0.22, snow - 0.8], [x - width * 0.1, snow + 0.6], [x, snow - 0.4]], fill: ROCK.snow },
    { kind: 'polygon', points: [[x, top], [x, snow - 0.4], [x + width * 0.14, snow + 0.5], [x + width * 0.26, snow - 0.6], [x + width * 0.38, snow]], fill: ROCK.snowShade },
  ]
}

/** A cloud: a few puffs, pale on top and shaded under. */
const cloud = (x: number, y: number, size: number): Shape[] => [
  { kind: 'ellipse', cx: x + size * 0.2, cy: y + size * 0.35, rx: size * 1.5, ry: size * 0.45, fill: SKY.cloudShade },
  { kind: 'ellipse', cx: x - size * 0.6, cy: y, rx: size * 0.8, ry: size * 0.5, fill: SKY.cloud },
  { kind: 'ellipse', cx: x + size * 0.3, cy: y - size * 0.3, rx: size, ry: size * 0.6, fill: SKY.cloud },
  { kind: 'ellipse', cx: x + size * 1.1, cy: y + size * 0.05, rx: size * 0.7, ry: size * 0.42, fill: SKY.cloud },
]

/** A small castle on a crag, far off: walls, towers with pointed roofs, dark windows. */
const castle = (x: number): Shape[] => {
  const base = GROUND - 7
  const tower = (tx: number, height: number): Shape[] => [
    { kind: 'rect', x: tx, y: base - height, w: 2, h: height, fill: CASTLE.wall },
    { kind: 'rect', x: tx + 1.5, y: base - height, w: 0.5, h: height, fill: CASTLE.shade },
    { kind: 'polygon', points: [[tx - 0.4, base - height], [tx + 2.4, base - height], [tx + 1, base - height - 2.4]], fill: CASTLE.roof },
    { kind: 'rect', x: tx + 0.75, y: base - height + 1.2, w: 0.5, h: 0.8, fill: CASTLE.window },
  ]
  return [
    { kind: 'polygon', points: [[x - 6, GROUND - 4], [x - 3, base], [x + 9, base], [x + 12, GROUND - 4]], fill: ROCK.cliffLit },
    { kind: 'rect', x: x - 1, y: base - 3, w: 10, h: 3, fill: CASTLE.wall },
    ...tower(x - 2, 5), ...tower(x + 3, 7.5), ...tower(x + 8, 5),
  ]
}

/** A cobbled road: two staggered rows of stones over dark mortar, lit on top. */
const cobbles = (columns: number, offset: number): Shape[] => [
  { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: COBBLE.mortar },
  ...[0, 1, 2].flatMap(row =>
    every(columns, offset + row * 1.6, 3.2, (x): Shape[] => [
      { kind: 'ellipse', cx: x + 1.5, cy: GROUND + 0.8 + row * 1.3, rx: 1.35, ry: 0.62, fill: COBBLE.stone },
      { kind: 'ellipse', cx: x + 1.2, cy: GROUND + 0.6 + row * 1.3, rx: 0.8, ry: 0.3, fill: COBBLE.lit },
    ]),
  ),
]

/** The Wilds, as in the banner: clouds, snowy mountains, a castle on a crag, a dark cliff, grass, a cobbled road. */
const wilds = (columns: number, step: number): Shape[] => {
  const far = step * PARALLAX.far
  const mid = step * PARALLAX.mid
  const near = step * PARALLAX.near
  return [
    { kind: 'rect', x: 0, y: 0, w: columns, h: GROUND, fill: { top: SKY.top, bottom: SKY.bottom, y0: 0, y1: GROUND - 4 } },
    ...every(columns, far * 0.5, 37, (x, i) => cloud(x, 3 + (i % 3) * 1.6, 2.2 + (i % 2))),
    ...every(columns, far, 23, (x, i) => peak(x, 6 + ((i * 7) % 5) * 1.6, 7 + (i % 3))),
    ...every(columns, far, 140, (x, i) => (i % 2 === 0 ? castle(x + 30) : [])),
    { kind: 'rect', x: 0, y: GROUND - 4.6, w: columns, h: 1, fill: SKY.bottom, opacity: 0.5 },
    ridge(columns, mid, GROUND - 2.2, 1.2, 2, ROCK.cliff),
    ridge(columns, near, GROUND - 0.6, 0.5, 3, GRASS.mid),
    ...every(columns, near, 9, (x, i): Shape[] => [
      { kind: 'polygon', points: [[x, GROUND], [x + 0.6, GROUND - 1.6 - (i % 2)], [x + 1.2, GROUND]], fill: GRASS.light },
      { kind: 'polygon', points: [[x + 1, GROUND], [x + 1.8, GROUND - 1.2], [x + 2.4, GROUND]], fill: GRASS.dark },
    ]),
    ...cobbles(columns, near),
  ]
}

/** The Map room: a long library — shelves of books, tall windows on snowy peaks, lanterns, map tables. */
const mapRoom = (columns: number, step: number): Shape[] => {
  const far = step * PARALLAX.far
  const mid = step * PARALLAX.mid
  const near = step * PARALLAX.near
  return [
    { kind: 'rect', x: 0, y: 0, w: columns, h: GROUND, fill: { top: 0x2e2420, bottom: 0x4e3a2e, y0: 0, y1: GROUND } },
    ...every(columns, far, 26, (x, i): Shape[] => [
      { kind: 'rect', x, y: 1, w: 21, h: GROUND - 1, fill: WOOD.dark },
      ...[0, 1, 2, 3].flatMap(row => [
        { kind: 'rect', x: x + 0.5, y: 6 + row * 5.2, w: 20, h: 0.6, fill: WOOD.mid } as Shape,
        ...Array.from({ length: 9 }, (_, k): Shape => {
          const tall = 3.4 - ((k + i + row) % 3) * 0.5
          return { kind: 'rect', x: x + 1 + k * 2.15, y: 6 + row * 5.2 - tall, w: 1.6, h: tall, fill: BOOKS[(k * 3 + row + i) % BOOKS.length] as number }
        }),
      ]),
    ]),
    ...every(columns, mid, 44, (x): Shape[] => [
      { kind: 'rect', x: x - 1, y: 3, w: 12, h: 16, fill: WOOD.mid },
      { kind: 'ellipse', cx: x + 5, cy: 6, rx: 5, ry: 3.6, fill: SKY.top },
      { kind: 'rect', x, y: 6, w: 10, h: 12, fill: { top: SKY.top, bottom: SKY.bottom, y0: 3, y1: 18 } },
      ...peak(x + 5, 5, 4).map((shape): Shape => (shape.kind === 'polygon' ? { ...shape, points: shape.points.map(([px, py]) => [px, py - 2] as const) } : shape)),
      { kind: 'rect', x: x + 4.6, y: 2.5, w: 0.8, h: 16, fill: WOOD.mid },
      { kind: 'rect', x: x - 1, y: 11.6, w: 12, h: 0.8, fill: WOOD.mid },
    ]),
    ...every(columns, near, 48, (x): Shape[] => [
      ...glow(x, 9, FIRE.gold, 3.2),
      { kind: 'rect', x: x - 0.15, y: 0, w: 0.3, h: 7, fill: WOOD.dark },
      { kind: 'rect', x: x - 1.2, y: 7, w: 2.4, h: 3, fill: WOOD.dark },
      { kind: 'rect', x: x - 0.8, y: 7.6, w: 1.6, h: 1.8, fill: FIRE.gold },
    ]),
    ...every(columns, near, 60, (x): Shape[] => [
      { kind: 'rect', x: x + 18, y: GROUND - 4, w: 9, h: 1, fill: WOOD.light },
      { kind: 'rect', x: x + 19, y: GROUND - 3, w: 1, h: 3, fill: WOOD.mid },
      { kind: 'rect', x: x + 25, y: GROUND - 3, w: 1, h: 3, fill: WOOD.mid },
      { kind: 'rect', x: x + 19.5, y: GROUND - 4.6, w: 6, h: 0.8, fill: 0xe8d8b0 },
      { kind: 'rect', x: x + 22.5, y: GROUND - 4.6, w: 0.6, h: 0.6, fill: 0xb03a2e },
    ]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: WOOD.plank },
    ...every(columns, near, 6, (x): Shape[] => [{ kind: 'rect', x, y: GROUND, w: 0.5, h: HEIGHT - GROUND, fill: WOOD.gap }]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: 0.5, fill: WOOD.light },
  ]
}

/** The Forge: a stone hall — brick walls, furnaces aglow, anvils and sparks, flagstones. */
const forge = (columns: number, step: number): Shape[] => {
  const far = step * PARALLAX.far
  const mid = step * PARALLAX.mid
  const near = step * PARALLAX.near
  return [
    { kind: 'rect', x: 0, y: 0, w: columns, h: GROUND, fill: { top: STONE.dark, bottom: STONE.wall, y0: 0, y1: GROUND } },
    ...[0, 1, 2, 3, 4, 5, 6, 7].flatMap(row =>
      every(columns, far + (row % 2) * 2.5, 5, (x): Shape[] => [
        { kind: 'rect', x, y: row * 3, w: 0.5, h: 3, fill: STONE.mortar },
        { kind: 'rect', x, y: row * 3, w: 5, h: 0.5, fill: STONE.mortar },
      ]),
    ),
    ...every(columns, far, 31, (x): Shape[] => [
      { kind: 'rect', x: x + 2, y: 3, w: 0.5, h: 7, fill: STEEL.dark },
      { kind: 'rect', x: x + 1, y: 9.5, w: 2.5, h: 1.6, fill: STEEL.mid },
      { kind: 'rect', x: x + 6, y: 3, w: 0.5, h: 6, fill: STEEL.dark },
      { kind: 'polygon', points: [[x + 5, 9], [x + 7.5, 9], [x + 6.2, 11]], fill: STEEL.mid },
    ]),
    ...every(columns, mid, 52, (x): Shape[] => [
      ...glow(x + 6, 17, FIRE.orange, 6),
      { kind: 'rect', x, y: 9, w: 12, h: GROUND - 9, fill: STONE.lit },
      { kind: 'ellipse', cx: x + 6, cy: 15, rx: 4, ry: 3.4, fill: STONE.dark },
      { kind: 'rect', x: x + 2, y: 15, w: 8, h: GROUND - 15, fill: STONE.dark },
      { kind: 'ellipse', cx: x + 6, cy: 19.5, rx: 3.4, ry: 3, fill: { top: FIRE.gold, bottom: FIRE.red, y0: 17, y1: 22.5 } },
    ]),
    ...every(columns, near, 33, (x, i): Shape[] => [
      { kind: 'polygon', points: [[x - 3.5, GROUND - 5.5], [x + 4.5, GROUND - 5.5], [x + 3, GROUND - 4], [x + 1.2, GROUND - 4], [x + 1.2, GROUND - 1.5], [x + 3, GROUND], [x - 2, GROUND], [x - 0.2, GROUND - 1.5], [x - 0.2, GROUND - 4], [x - 2, GROUND - 4]], fill: STEEL.mid },
      { kind: 'rect', x: x - 3, y: GROUND - 5.5, w: 7, h: 0.5, fill: STEEL.lit },
      ...[0, 1, 2].map((k): Shape => ({ kind: 'rect', x: x + ((i * 7 + k * 5 + step * 3) % 9) - 4, y: GROUND - 7 - ((k * 3 + step * 2 + i) % 6), w: 0.5, h: 0.5, fill: FIRE.gold })),
    ]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: STONE.mortar },
    ...[0, 1].flatMap(row =>
      every(columns, near + row * 2, 4, (x): Shape[] => [{ kind: 'rect', x: x + 0.25, y: GROUND + 0.25 + row * 2, w: 3.5, h: 1.6, fill: row === 0 ? STONE.lit : STONE.wall }]),
    ),
  ]
}

/** The Arena: a sunset over tiers of stone arches, banners on poles, a sand floor. */
const arena = (columns: number, step: number): Shape[] => {
  const far = step * PARALLAX.far
  const mid = step * PARALLAX.mid
  const near = step * PARALLAX.near
  return [
    { kind: 'rect', x: 0, y: 0, w: columns, h: GROUND, fill: { top: 0x6a4a78, bottom: 0xf0b07a, y0: 0, y1: GROUND - 6 } },
    ...glow(columns * 0.7, GROUND - 9, FIRE.gold, 4),
    { kind: 'rect', x: 0, y: 8, w: columns, h: GROUND - 8, fill: CASTLE.shade },
    ...every(columns, far, 6, (x): Shape[] => [
      { kind: 'ellipse', cx: x + 3, cy: 11.5, rx: 1.8, ry: 2, fill: 0x4a3a40 },
      { kind: 'rect', x: x + 1.2, y: 11.5, w: 3.6, h: 3, fill: 0x4a3a40 },
      { kind: 'ellipse', cx: x + 3, cy: 17.5, rx: 1.8, ry: 2, fill: 0x4a3a40 },
      { kind: 'rect', x: x + 1.2, y: 17.5, w: 3.6, h: 3, fill: 0x4a3a40 },
    ]),
    { kind: 'rect', x: 0, y: 8, w: columns, h: 1, fill: CASTLE.wall },
    { kind: 'rect', x: 0, y: 14.5, w: columns, h: 1, fill: CASTLE.wall },
    ...every(columns, mid, 30, (x, i): Shape[] => [
      { kind: 'rect', x, y: 4, w: 0.6, h: GROUND - 4, fill: WOOD.dark },
      { kind: 'polygon', points: [[x + 0.6, 4.5], [x + 5, 4.5], [x + 5, 10], [x + 2.8, 8.6], [x + 0.6, 10]], fill: i % 2 === 0 ? 0xc8402e : 0x3f5a9a },
    ]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: { top: 0xe0c08a, bottom: 0xb8935e, y0: GROUND, y1: HEIGHT } },
    ...every(columns, near, 5, (x, i): Shape[] => [{ kind: 'rect', x: x + (i % 3), y: GROUND + 1 + (i % 2) * 1.5, w: 0.5, h: 0.5, fill: 0x9a7a4a }]),
  ]
}

/** The Harbour: the banner's sea, distant sails, a wooden pier, gulls. */
const harbour = (columns: number, step: number): Shape[] => {
  const far = step * PARALLAX.far
  const mid = step * PARALLAX.mid
  const near = step * PARALLAX.near
  return [
    { kind: 'rect', x: 0, y: 0, w: columns, h: GROUND, fill: { top: SKY.top, bottom: SKY.bottom, y0: 0, y1: 12 } },
    ...every(columns, far * 0.5, 41, (x, i) => cloud(x, 3 + (i % 3) * 1.4, 2 + (i % 2))),
    { kind: 'rect', x: 0, y: 12, w: columns, h: GROUND - 12, fill: { top: 0x8ea2bc, bottom: 0x4e6a8e, y0: 12, y1: GROUND } },
    ...every(columns, far, 29, (x, i): Shape[] => [
      { kind: 'polygon', points: [[x, 12], [x + 4, 12], [x + 3.4, 13], [x + 0.6, 13]], fill: WOOD.mid },
      { kind: 'polygon', points: [[x + 2, 6 + (i % 2)], [x + 2, 11.8], [x + 4.5, 11.8]], fill: SKY.cloud },
    ]),
    ...every(columns, mid, 7, (x, i): Shape[] => [{ kind: 'rect', x: x + (i % 4), y: 15 + (i % 3) * 2.5, w: 2.5, h: 0.5, fill: 0xb8cce0 }]),
    ...every(columns, far, 23, (x, i): Shape[] => [
      { kind: 'rect', x: x + 3, y: 5 + (i % 3), w: 1, h: 0.5, fill: 0x3a3440 },
      { kind: 'rect', x: x + 2, y: 4.5 + (i % 3), w: 1, h: 0.5, fill: 0x3a3440 },
      { kind: 'rect', x: x + 4, y: 4.5 + (i % 3), w: 1, h: 0.5, fill: 0x3a3440 },
    ]),
    ...every(columns, near, 12, (x): Shape[] => [{ kind: 'rect', x, y: GROUND - 3, w: 1.2, h: 3, fill: WOOD.dark }]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: WOOD.plank },
    ...every(columns, near, 4, (x): Shape[] => [{ kind: 'rect', x, y: GROUND, w: 0.5, h: HEIGHT - GROUND, fill: WOOD.gap }]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: 0.5, fill: WOOD.light },
  ]
}

/** The Watchtower: dusk over snowy peaks, a dark pine forest, a dirt road between grass. */
const watchtower = (columns: number, step: number): Shape[] => {
  const far = step * PARALLAX.far
  const mid = step * PARALLAX.mid
  const near = step * PARALLAX.near
  return [
    { kind: 'rect', x: 0, y: 0, w: columns, h: GROUND, fill: { top: 0x3a3e6a, bottom: 0xd89a8a, y0: 0, y1: GROUND - 6 } },
    ...every(columns, far, 21, (x, i) => peak(x, 5 + ((i * 5) % 4) * 1.5, 6 + (i % 3))),
    ...every(columns, mid, 5, (x, i): Shape[] => {
      const h = 6 + ((i * 7) % 5)
      return [
        { kind: 'polygon', points: [[x - 2.4, GROUND - 2], [x + 2.4, GROUND - 2], [x, GROUND - 2 - h]], fill: 0x2e4a3a },
        { kind: 'rect', x: x - 0.3, y: GROUND - 2, w: 0.6, h: 2, fill: 0x2a2420 },
      ]
    }),
    ridge(columns, near, GROUND - 0.6, 0.5, 5, GRASS.mid),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: 0x7a5a3e },
    ...every(columns, near, 6, (x, i): Shape[] => [{ kind: 'rect', x: x + (i % 3), y: GROUND + 1.5 + (i % 2), w: 1, h: 0.5, fill: 0x5a3e2a }]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: 0.6, fill: GRASS.dark },
  ]
}

/** The Dungeon: a cave of dark stone — arches behind, pillars hung with chains, torchlight, a flagstone floor. */
const dungeon = (columns: number, step: number): Shape[] => {
  const far = step * PARALLAX.far
  const mid = step * PARALLAX.mid
  const near = step * PARALLAX.near
  return [
    { kind: 'rect', x: 0, y: 0, w: columns, h: GROUND, fill: { top: 0x15121c, bottom: 0x342c3e, y0: 0, y1: GROUND } },
    ...every(columns, far, 18, (x): Shape[] => [
      { kind: 'ellipse', cx: x + 7, cy: 9, rx: 6, ry: 5, fill: 0x0e0c14 },
      { kind: 'rect', x: x + 1, y: 9, w: 12, h: GROUND - 9, fill: 0x0e0c14 },
    ]),
    ...every(columns, mid, 27, (x, i): Shape[] => [
      { kind: 'rect', x, y: 0, w: 4, h: GROUND, fill: 0x4a4256 },
      { kind: 'rect', x: x + 3, y: 0, w: 1, h: GROUND, fill: 0x3a3446 },
      { kind: 'rect', x: x + 5, y: 0, w: 0.4, h: 5 + (i % 3) * 2, fill: STEEL.mid },
      { kind: 'ellipse', cx: x + 5.2, cy: 5.5 + (i % 3) * 2, rx: 0.8, ry: 0.6, fill: STEEL.lit },
    ]),
    ...every(columns, near, 44, (x): Shape[] => [
      ...glow(x, 10, FIRE.orange, 3.5),
      { kind: 'rect', x: x - 0.3, y: 10, w: 0.6, h: 3, fill: WOOD.dark },
      { kind: 'ellipse', cx: x, cy: 9, rx: 0.9, ry: 1.4, fill: FIRE.gold },
    ]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: 0x221c28 },
    ...[0, 1].flatMap(row =>
      every(columns, near + row * 2.5, 5, (x): Shape[] => [{ kind: 'rect', x: x + 0.3, y: GROUND + 0.3 + row * 2, w: 4.4, h: 1.6, fill: row === 0 ? 0x3e3848 : 0x2e2a38 }]),
    ),
  ]
}

/** The Camp: a starry night, dark mountains, pines, a dirt clearing. */
const camp = (columns: number, step: number): Shape[] => {
  const far = step * PARALLAX.far
  const mid = step * PARALLAX.mid
  const near = step * PARALLAX.near
  return [
    { kind: 'rect', x: 0, y: 0, w: columns, h: GROUND, fill: { top: 0x101430, bottom: 0x3a3a6a, y0: 0, y1: GROUND - 4 } },
    ...every(columns, far * 0.25, 7, (x, i): Shape[] => [{ kind: 'rect', x: x + ((i * 5) % 7), y: 1 + ((i * 3) % 9), w: 0.5, h: 0.5, fill: i % 4 === 0 ? FIRE.gold : SKY.cloud }]),
    { kind: 'ellipse', cx: columns * 0.82, cy: 5, rx: 2.2, ry: 2.2, fill: SKY.cloud },
    ...every(columns, far, 24, (x, i): Shape[] => [
      { kind: 'polygon', points: [[x - 8, GROUND - 4], [x, GROUND - 13 - (i % 3) * 2], [x + 8, GROUND - 4]], fill: 0x2a2c52 },
    ]),
    ...every(columns, mid, 5, (x, i): Shape[] => {
      const h = 5 + ((i * 7) % 4)
      return [{ kind: 'polygon', points: [[x - 2.2, GROUND - 1.5], [x + 2.2, GROUND - 1.5], [x, GROUND - 1.5 - h]], fill: 0x1e2e2e }]
    }),
    { kind: 'rect', x: 0, y: GROUND - 1.6, w: columns, h: 1.6, fill: 0x1e2e2e },
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: HEIGHT - GROUND, fill: 0x4a3a2e },
    ...every(columns, near, 7, (x, i): Shape[] => [{ kind: 'rect', x: x + (i % 4), y: GROUND + 1.5 + (i % 2), w: 1, h: 0.5, fill: 0x33281f }]),
    { kind: 'rect', x: 0, y: GROUND, w: columns, h: 0.5, fill: 0x2e4a32 },
  ]
}

/** The zone's landscape `columns` units wide, `step` steps into the walk (0 when still). */
export const landscape = (zone: Zone, columns: number, step = 0): Picture => {
  switch (zone) {
    case 'wilds':
      return wilds(columns, step)
    case 'map':
      return mapRoom(columns, step)
    case 'forge':
      return forge(columns, step)
    case 'arena':
      return arena(columns, step)
    case 'harbour':
      return harbour(columns, step)
    case 'watchtower':
      return watchtower(columns, step)
    case 'dungeon':
      return dungeon(columns, step)
    case 'camp':
      return camp(columns, step)
  }
}
