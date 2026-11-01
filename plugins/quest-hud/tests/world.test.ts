import { describe, expect, test } from 'claude-code/testing'

import { bounds } from '../src/paint/picture'
import type { Sprite } from '../src/paint/pixels'
import { CHEST, DRAGON, FLAG, GHOST, MASCOT, OCTOCAT, PALETTE, POSES, SPIDER, TANUKI, WIZARD } from '../src/world/sprites'
import { GROUND, HEIGHT, landscape } from '../src/world/landscapes'

// Each sprite and the size it must be, in art pixels: two a unit, so a 16-unit figure is 32 × 32.
const CAST: ReadonlyArray<readonly [string, Sprite, number, number]> = [
  ...POSES.map(pose => [`wizard ${pose}`, WIZARD[pose], 32, 32] as const),
  ['mascot', MASCOT.still, 20, 16], ['mascot hop', MASCOT.hop, 20, 16], ['ghost', GHOST, 32, 32], ['dragon', DRAGON, 32, 32],
  ['spider', SPIDER, 32, 32], ['octocat', OCTOCAT, 32, 32], ['tanuki', TANUKI, 32, 32], ['chest', CHEST, 32, 24],
  ['flag done', FLAG.done, 16, 32], ['flag now', FLAG.now, 16, 32], ['flag todo', FLAG.todo, 16, 32],
]

describe('the cast', () => {
  test('each sprite is its size, every row as wide, every pixel a palette colour or none', () => {
    for (const [name, sprite, width, height] of CAST) {
      expect([name, sprite.rows.length, sprite.rows.every(row => row.length === width)]).toEqual([name, height, true])
      expect([name, sprite.rows.join('').split('').filter(c => c !== '.' && !(c in PALETTE))]).toEqual([name, []])
    }
  })

  test('the figures stand on the bottom of their box', () => {
    for (const [name, sprite] of CAST.filter(([n]) => !n.startsWith('mascot hop') && n !== 'ghost')) {
      expect([name, /[^.]/.test(sprite.rows[sprite.rows.length - 1] ?? '')]).toEqual([name, true])
    }
  })

  test('every pose differs from standing, the mascot hops, and the flags differ by state', () => {
    for (const pose of POSES.filter(p => p !== 'stand')) expect(WIZARD[pose].rows.join() === WIZARD.stand.rows.join()).toBe(false)
    expect(MASCOT.hop.rows.join() === MASCOT.still.rows.join()).toBe(false)
    expect(new Set([FLAG.done, FLAG.now, FLAG.todo].map(f => f.rows.join())).size).toBe(3)
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
