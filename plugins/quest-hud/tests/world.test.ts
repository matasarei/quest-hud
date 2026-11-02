import { describe, expect, test } from 'claude-code/testing'

import { bounds } from '../src/paint/picture'
import type { Sprite } from '../src/paint/pixels'
import { BAND_CAST, BAND_ICON, CHEST, DRAGON, FLAG, FLYING_BOOKS, FOX, GHOST, GOLEM, MASCOT, OCTOCAT, PALETTE, POSES, PROPS, SKELETON, SPIDER, WIZARD } from '../src/world/sprites'
import { GROUND, HEIGHT, landscape } from '../src/world/landscapes'

// Each sprite and the size it must be, in art pixels: two a unit, so a 16-unit figure is 32 × 32.
const CAST: ReadonlyArray<readonly [string, Sprite, number, number]> = [
  ...POSES.map(pose => [`wizard ${pose}`, WIZARD[pose], 32, 32] as const),
  ['mascot', MASCOT.still, 20, 16], ['mascot hop', MASCOT.hop, 20, 16], ['ghost', GHOST, 32, 32], ['dragon', DRAGON.still, 32, 32], ['dragon lunge', DRAGON.lunge, 32, 32],
  ['spider', SPIDER.still, 32, 32], ['spider lunge', SPIDER.lunge, 32, 32], ['skeleton', SKELETON.still, 32, 32], ['skeleton lunge', SKELETON.lunge, 32, 32],
  ['golem', GOLEM.still, 32, 32], ['golem lunge', GOLEM.lunge, 32, 32], ['flying books', FLYING_BOOKS.still, 32, 32], ['flying books lunge', FLYING_BOOKS.lunge, 32, 32], ['octocat', OCTOCAT.still, 20, 16], ['octocat wiggle', OCTOCAT.hop, 20, 16], ['fox', FOX.still, 20, 16], ['fox hop', FOX.hop, 20, 16], ['chest', CHEST, 32, 24],
  ['flag done', FLAG.done, 16, 32], ['flag now', FLAG.now, 16, 32], ['flag todo', FLAG.todo, 16, 32],
  ['oak', PROPS.oak, 32, 43], ['mushrooms', PROPS.mushrooms, 16, 32], ['crystal', PROPS.crystal, 16, 32],
  ['band icon', BAND_ICON, 20, 12],
  ['band cast', BAND_CAST, 20, 12],
]

describe('the cast', () => {
  test('each sprite is its size, every row as wide, every pixel a palette colour or none', () => {
    for (const [name, sprite, width, height] of CAST) {
      expect([name, sprite.rows.length, sprite.rows.every(row => row.length === width)]).toEqual([name, height, true])
      expect([name, sprite.rows.join('').split('').filter(c => c !== '.' && !(c in PALETTE))]).toEqual([name, []])
    }
  })

  test('the figures stand on the bottom of their box', () => {
    for (const [name, sprite] of CAST.filter(([n]) => !n.startsWith('mascot hop') && n !== 'fox hop' && n !== 'ghost' && !n.startsWith('band'))) {
      expect([name, /[^.]/.test(sprite.rows[sprite.rows.length - 1] ?? '')]).toEqual([name, true])
    }
  })

  test('every pose differs from standing, the mascot hops, and the flags differ by state', () => {
    for (const pose of POSES.filter(p => p !== 'stand')) expect(WIZARD[pose].rows.join() === WIZARD.stand.rows.join()).toBe(false)
    expect(MASCOT.hop.rows.join() === MASCOT.still.rows.join()).toBe(false)
    expect(OCTOCAT.hop.rows.join() === OCTOCAT.still.rows.join()).toBe(false)
    expect(FOX.hop.rows.join() === FOX.still.rows.join()).toBe(false)
    for (const monster of [DRAGON, SPIDER, SKELETON, GOLEM, FLYING_BOOKS]) expect(monster.lunge.rows.join() === monster.still.rows.join()).toBe(false)
    expect(new Set([FLAG.done, FLAG.now, FLAG.todo].map(f => f.rows.join())).size).toBe(3)
  })
})

describe('the band\'s wizard', () => {
  /** The pixels a quadrant cell shows: the art's rows halved, each 2 × 2 block. */
  const blocks = (sprite: Sprite): string[] => {
    const rows = sprite.rows.filter((_, y) => y % 2 === 0)
    const out: string[] = []
    for (let y = 0; y < rows.length; y += 2) {
      for (let x = 0; x < (rows[0]?.length ?? 0); x += 2) {
        out.push([rows[y]?.[x], rows[y]?.[x + 1], rows[y + 1]?.[x], rows[y + 1]?.[x + 1]].join(''))
      }
    }
    return out
  }

  test('keeps each quadrant cell to the two colours it can show', () => {
    for (const [name, sprite] of [['icon', BAND_ICON], ['cast', BAND_CAST]] as const) {
      expect([name, sprite.rows.every((row, y) => y % 2 === 1 || row === sprite.rows[y + 1])]).toEqual([name, true])
      expect([name, blocks(sprite).filter(block => new Set(block).size > 2)]).toEqual([name, []])
    }
  })

  test('casts by raising the whole staff a row: as long as at rest, its foot off the ground', () => {
    /** The rows the staff spans, orb to foot: the first and last row with its wood or orb in it. */
    const span = (sprite: Sprite): readonly [number, number] => {
      const rows = sprite.rows.map((row, y) => (/[w~`]/.test(row) ? y : -1)).filter(y => y >= 0)
      return [rows[0] ?? -1, rows[rows.length - 1] ?? -1]
    }
    const [top, foot] = span(BAND_ICON)
    expect(foot).toBe(BAND_ICON.rows.length - 1)
    // One cell-pixel row up is two art rows.
    expect(span(BAND_CAST)).toEqual([top - 2, foot - 2])
  })
})

describe('Claude\'s mascot', () => {
  test('both frames keep each quadrant cell to two colours, so text cells draw it clean', () => {
    for (const [name, sprite] of [['still', MASCOT.still], ['hop', MASCOT.hop]] as const) {
      const rows = sprite.rows.filter((_, y) => y % 2 === 0)
      const crowded: string[] = []
      for (let y = 0; y + 1 < rows.length; y += 2) {
        for (let x = 0; x + 1 < (rows[0]?.length ?? 0); x += 2) {
          const block = new Set([rows[y]?.[x], rows[y]?.[x + 1], rows[y + 1]?.[x], rows[y + 1]?.[x + 1]])
          if (block.size > 2) crowded.push(`${x},${y}`)
        }
      }
      expect([name, crowded]).toEqual([name, []])
    }
  })
})

describe('the landscapes', () => {
  test('cover the whole width from the top to the bottom, in every zone and at any step', () => {
    for (const zone of ['wilds', 'map', 'forge', 'arena', 'harbour', 'watchtower', 'dungeon', 'camp'] as const) {
      for (const step of [0, 7]) {
        const all = landscape(zone, 120, step).map(bounds)
        expect(all.some(b => b[0] <= 0 && b[2] >= 120 && b[1] <= 0 && b[3] >= GROUND)).toBe(true)
        expect(all.some(b => b[0] <= 0 && b[2] >= 120 && b[1] <= GROUND && b[3] >= HEIGHT)).toBe(true)
      }
    }
  })

  test('a step moves the layers, and still is still', () => {
    expect(JSON.stringify(landscape('wilds', 80, 3)) === JSON.stringify(landscape('wilds', 80, 3))).toBe(true)
    expect(JSON.stringify(landscape('wilds', 80, 3)) === JSON.stringify(landscape('wilds', 80, 4))).toBe(false)
  })
})
