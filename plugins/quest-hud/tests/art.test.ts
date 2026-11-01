import { describe, expect, test } from 'claude-code/testing'

import { SPRITES, type SpriteName } from '../src/art/sprites'
import { BACKDROPS } from '../src/scene'

// Every sprite the scene draws: the import must keep producing these.
const USED: readonly SpriteName[] = [
  'wizard', 'ghost', 'flag',
  'dirt', 'grassTexture', 'water',
  'pine', 'pineLayered', 'roundTree', 'twinPines', 'oak', 'grass', 'palm',
  'campfire', 'tent', 'tower', 'redWall', 'brickWall', 'cobweb', 'tombstone', 'skull', 'torch',
  'axe', 'sword', 'shield', 'chest', 'key', 'scroll', 'scrollOpen', 'bench',
]

describe('the imported sprites', () => {
  test('every sprite the scene uses is there', () => {
    expect(USED.filter(name => !(name in SPRITES))).toEqual([])
  })

  test('nothing is imported that the scene does not use', () => {
    expect(Object.keys(SPRITES).filter(name => !USED.includes(name as SpriteName))).toEqual([])
  })

  test('every sprite a backdrop names is imported', () => {
    for (const backdrop of Object.values(BACKDROPS)) {
      const names = [...backdrop.far, backdrop.texture, ...backdrop.props.map(prop => (typeof prop === 'string' ? prop : prop[0]))]
      expect(names.filter(name => !(name in SPRITES))).toEqual([])
    }
  })

  for (const [name, sprite] of Object.entries(SPRITES)) {
    test(`${name}: 16 × 16, one colour (the pack is 1-bit), every pixel in its palette`, () => {
      expect([sprite.width, sprite.height]).toEqual([16, 16])
      expect(sprite.map).toHaveLength(16)
      expect(sprite.map.every(line => line.length === 16)).toBe(true)
      expect(Object.keys(sprite.palette)).toHaveLength(1)
      const missing = sprite.map.join('').split('').filter(c => c !== '.' && !(c in sprite.palette))
      expect(missing).toEqual([])
    })
  }
})
