import { describe, expect, test } from 'claude-code/testing'

import { bounds, type Picture } from '../src/paint/picture'
import { chest, dragon, familiar, FIGURE_HEIGHT, flag, FOOTPRINT, ghost, octocat, POSES, spider, tanuki, wizard } from '../src/world/figures'
import { GROUND, HEIGHT, landscape } from '../src/world/landscapes'

const box = (picture: Picture): [number, number, number, number] => {
  const all = picture.map(bounds)
  return [Math.min(...all.map(b => b[0])), Math.min(...all.map(b => b[1])), Math.max(...all.map(b => b[2])), Math.max(...all.map(b => b[3]))]
}

describe('the figures', () => {
  const figures: ReadonlyArray<readonly [keyof typeof FOOTPRINT, Picture]> = [
    ['wizard', wizard()], ['familiar', familiar()], ['ghost', ghost()], ['flag', flag('now')], ['dragon', dragon()],
    ['spider', spider()], ['octocat', octocat()], ['tanuki', tanuki()], ['chest', chest()],
  ]

  test('each stays inside its footprint, feet on the box\'s bottom', () => {
    for (const [name, picture] of figures) {
      const [left, top, right, bottom] = box(picture)
      expect([name, left >= 0, right <= FOOTPRINT[name] + 0.01, top >= -0.01, bottom <= FIGURE_HEIGHT + 0.01]).toEqual([name, true, true, true, true])
    }
  })

  test('every pose of the wizard differs from standing, and stays in his box', () => {
    const stand = JSON.stringify(wizard('stand'))
    for (const pose of POSES.filter(p => p !== 'stand')) {
      expect(JSON.stringify(wizard(pose)) === stand).toBe(false)
      const [left, top, right, bottom] = box(wizard(pose))
      expect(left >= 0 && right <= FOOTPRINT.wizard + 0.01 && top >= -1 && bottom <= FIGURE_HEIGHT + 0.01).toBe(true)
    }
  })

  test('the familiar hops, and the flags take their state\'s colour', () => {
    expect(JSON.stringify(familiar(true)) === JSON.stringify(familiar(false))).toBe(false)
    expect(new Set(['done', 'now', 'todo'].map(s => JSON.stringify(flag(s as 'done' | 'now' | 'todo')))).size).toBe(3)
  })
})

describe('the landscapes', () => {
  test('cover the whole width from the top to the bottom, in every zone and at any step', () => {
    for (const zone of ['wilds', 'map', 'forge', 'arena', 'harbour', 'watchtower', 'dungeon', 'camp'] as const) {
      for (const step of [0, 7]) {
        const picture = landscape(zone, 120, step)
        const [sky] = picture
        expect(sky?.kind).toBe('rect')
        const all = picture.map(bounds)
        expect(Math.min(...all.map(b => b[1])) <= 0).toBe(true)
        expect(Math.max(...all.map(b => b[3])) >= HEIGHT).toBe(true)
        expect(all.some(b => b[0] <= 0 && b[2] >= 120 && b[1] <= GROUND && b[3] >= HEIGHT)).toBe(true)
      }
    }
  })

  test('a step moves the layers, and still is still', () => {
    expect(JSON.stringify(landscape('wilds', 80, 3)) === JSON.stringify(landscape('wilds', 80, 3))).toBe(true)
    expect(JSON.stringify(landscape('wilds', 80, 3)) === JSON.stringify(landscape('wilds', 80, 4))).toBe(false)
  })
})
