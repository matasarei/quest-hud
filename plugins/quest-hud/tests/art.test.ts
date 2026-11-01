import { describe, expect, test } from 'claude-code/testing'

import { SPRITES, type SpriteName } from '../src/art/sprites'

// Every sprite the scene draws: the import must keep producing these.
const USED: readonly SpriteName[] = [
  'astronaut', 'astronautStep', 'flag',
  'winterA', 'winterB', 'winterC', 'desertA', 'desertB', 'forestA', 'forestB',
  'grass', 'sand', 'snow', 'dirt', 'water',
  'brick', 'crate', 'lever', 'spikes', 'banner', 'bridgeLeft', 'bridgeMid', 'bridgeRight',
  'sign', 'arrow', 'door', 'key', 'brickCross', 'mushroom', 'sprout', 'pine', 'ladder', 'bush',
]

describe('the imported sprites', () => {
  test('every sprite the scene uses is there', () => {
    expect(USED.filter(name => !(name in SPRITES))).toEqual([])
  })

  for (const [name, sprite] of Object.entries(SPRITES)) {
    test(`${name}: its map is as large as it says, and every pixel has a colour`, () => {
      expect(sprite.map).toHaveLength(sprite.height)
      expect(sprite.map.every(line => line.length === sprite.width)).toBe(true)
      const missing = sprite.map.join('').split('').filter(c => c !== '.' && !(c in sprite.palette))
      expect(missing).toEqual([])
    })
  }

  test('the astronaut and its step are the same size, so the bob does not jump', () => {
    expect([SPRITES.astronautStep.width, SPRITES.astronautStep.height]).toEqual([SPRITES.astronaut.width, SPRITES.astronaut.height])
  })

  test('backdrops are 24 px tall, the band the scene puts above the ground', () => {
    for (const name of ['winterA', 'winterB', 'winterC', 'desertA', 'desertB', 'forestA', 'forestB'] as const) {
      expect(SPRITES[name].height).toBe(24)
    }
  })
})
