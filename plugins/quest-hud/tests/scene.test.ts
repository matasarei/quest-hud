import { describe, expect, test } from 'claude-code/testing'

import { SPRITES } from '../src/art/sprites'
import {
  ALLY_COLOR, avatarX, BACKDROPS, figures, FLAG_SLOT, FLAG_WIDTH, layout, MIN_FLAGS, propsWidth, fitWaypoints, flagSlots, FOE_COLOR, foeX, GROUND_ROW, half, MAX_FLAGS, MAX_GHOSTS, roadWidth, scene,
  SCENE_HEIGHT, skyColor, waypointsOf, waypointX, WIZARD_COLOR, type Waypoint,
} from '../src/scene'
import type { Task, Zone } from '../types'

const ZONES: readonly Zone[] = ['watchtower', 'harbour', 'dungeon', 'arena', 'forge', 'map', 'camp', 'wilds']

const task = (id: string, status: Task['status']): Task => ({ id, subject: id, status })

/** Whether the purple wizard shows in the grid at (x, y): every pixel of its sprite that falls inside. */
const wizardAt = (grid: ReturnType<typeof scene>, x: number, y: number): boolean =>
  SPRITES.wizard.map.every((line, dy) =>
    [...line].every((c, dx) => c === '.' || y + dy < 0 || y + dy >= grid.length || x + dx >= (grid[0]?.length ?? 0) || grid[y + dy]?.[x + dx] === WIZARD_COLOR),
  )

const red = (c: number | undefined) => c !== undefined && ((c >> 16) & 255) > ((c >> 8) & 255) + 60 && ((c >> 16) & 255) > (c & 255) + 60

describe('waypointsOf and fitWaypoints', () => {
  test('one flag per task, in order, with its state', () => {
    expect(waypointsOf([task('a', 'completed'), task('b', 'in_progress'), task('c', 'pending')])).toEqual(['done', 'now', 'todo'])
  })

  test('no tasks, no flags; no room, no flags', () => {
    expect(waypointsOf([])).toEqual([])
    expect(fitWaypoints(['done', 'now'], 0)).toEqual([])
  })

  test('more tasks than flags share them, and a shared flag shows the most urgent state', () => {
    const tasks = Array.from({ length: 30 }, (_, i) => task(String(i), i < 10 ? 'completed' : i === 10 ? 'in_progress' : 'pending'))
    const flags = waypointsOf(tasks)
    expect(flags).toHaveLength(MAX_FLAGS)
    expect(flags.filter(f => f === 'now')).toHaveLength(1)
    expect(flags[0]).toBe('done')
    expect(flags[MAX_FLAGS - 1]).toBe('todo')
    expect(fitWaypoints(['done', 'now', 'todo', 'todo'], 2)).toEqual(['now', 'todo'])
  })
})

describe('the road', () => {
  test('the props keep their space at the right; flags fit what is left', () => {
    expect(roadWidth(120, 'camp')).toBe(120 - (SPRITES.tent.width + SPRITES.campfire.width + 4))
    expect(flagSlots(roadWidth(120, 'camp')) > 0).toBe(true)
    expect(flagSlots(4)).toBe(0)
  })

  test('the wizard starts just right of the flag in progress, else the first to do, else the last', () => {
    expect(avatarX(['done', 'now', 'todo'], 80)).toBe(waypointX(1, 3, 80) + FLAG_WIDTH)
    expect(avatarX(['done', 'todo', 'todo'], 80)).toBe(waypointX(1, 3, 80) + FLAG_WIDTH)
    expect(avatarX(['done', 'done'], 80)).toBe(waypointX(1, 2, 80) + FLAG_WIDTH)
    expect(avatarX([], 80)).toBe(2)
  })
})

describe('scene', () => {
  const three: Waypoint[] = ['done', 'now', 'todo']

  test('is columns × SCENE_HEIGHT pixels, every pixel filled, in every zone', () => {
    for (const zone of ZONES) {
      const grid = scene({ columns: 90, zone, waypoints: three, companions: 1, frame: 0 })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === 90 && line.every(c => c !== undefined))).toBe(true)
    }
  })

  test('each zone has its own background, and the scene starts with it', () => {
    expect(new Set(ZONES.map(skyColor)).size).toBe(ZONES.length)
    for (const zone of ZONES) {
      expect(scene({ columns: 40, zone, waypoints: [], companions: 0, frame: 0 })[0]?.[0]).toBe(skyColor(zone))
    }
  })

  test('the ground band starts at GROUND_ROW: below it, no background shows', () => {
    for (const zone of ZONES) {
      const grid = scene({ columns: 60, zone, waypoints: three, companions: 2, frame: 0 })
      const below = grid.slice(GROUND_ROW).flat()
      expect(below.filter(c => c === BACKDROPS[zone].background)).toEqual([])
      expect(grid[GROUND_ROW]?.some(c => c === BACKDROPS[zone].ground)).toBe(true)
    }
  })

  test('the wizard stands on the ground, just right of the flag in progress', () => {
    const grid = scene({ columns: 120, zone: 'camp', waypoints: three, companions: 0, frame: 0 })
    const road = roadWidth(120, 'camp')
    const flags = fitWaypoints(three, flagSlots(road))
    expect(wizardAt(grid, avatarX(flags, road), GROUND_ROW - SPRITES.wizard.height)).toBe(true)
  })

  test('no tasks: the wizard at the left margin', () => {
    const grid = scene({ columns: 80, zone: 'wilds', waypoints: [], companions: 0, frame: 0 })
    expect(wizardAt(grid, 2, GROUND_ROW - SPRITES.wizard.height)).toBe(true)
  })

  test('frame 1 lifts the wizard a pixel; only the figures change', () => {
    const still = scene({ columns: 120, zone: 'forge', waypoints: three, companions: 2, frame: 0 })
    const lifted = scene({ columns: 120, zone: 'forge', waypoints: three, companions: 2, frame: 1 })
    const road = roadWidth(120, 'forge')
    const hero = avatarX(fitWaypoints(three, flagSlots(road)), road)
    expect(wizardAt(lifted, hero, GROUND_ROW - SPRITES.wizard.height - 1)).toBe(true)
    still.forEach((line, y) => line.forEach((color, x) => {
      if (lifted[y]?.[x] !== color) expect(x >= hero - 10 * 2 && x < hero + SPRITES.wizard.width).toBe(true)
    }))
  })

  test('the flags are recoloured: the pack\'s red is gone, and the one in progress is yellow', () => {
    const grid = scene({ columns: 120, zone: 'map', waypoints: ['now'], companions: 0, frame: 0 })
    const x0 = waypointX(0, 1, roadWidth(120, 'map'))
    const flagPixels = grid.slice(GROUND_ROW - 8, GROUND_ROW).flatMap(line => line.slice(x0, x0 + FLAG_WIDTH))
    expect(flagPixels.filter(red)).toEqual([])
    expect(flagPixels.some(c => c === 0xf2d15b)).toBe(true)
  })

  test('ghosts are drawn up to MAX_GHOSTS', () => {
    const none = scene({ columns: 160, zone: 'wilds', waypoints: ['now'], companions: 0, frame: 0 })
    const many = scene({ columns: 160, zone: 'wilds', waypoints: ['now'], companions: MAX_GHOSTS + 3, frame: 0 })
    const four = scene({ columns: 160, zone: 'wilds', waypoints: ['now'], companions: MAX_GHOSTS, frame: 0 })
    const changed = (a: typeof none, b: typeof none) => a.flatMap((line, y) => line.filter((c, x) => b[y]?.[x] !== c)).length
    expect(changed(none, many) > 0).toBe(true)
    expect(changed(four, many)).toBe(0)
    expect(half([[1, 2, 3], [4, 5, 6], [7, 8, 9]])).toEqual([[1, 3], [7, 9]])
  })

  test('narrow widths still give a full grid, clipped', () => {
    for (const columns of [24, 8, 0]) {
      const grid = scene({ columns, zone: 'harbour', waypoints: three, companions: 3, frame: 1 })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === columns)).toBe(true)
    }
  })
})

describe('the Map room', () => {
  test('is indoors: no trees behind it, and none of the props that read as crates', () => {
    const outdoors = ['pine', 'pineLayered', 'roundTree', 'twinPines', 'oak', 'grass', 'palm']
    const crates = ['scroll', 'scrollOpen', 'bench']
    const props = BACKDROPS.map.props.map(prop => (typeof prop === 'string' ? prop : prop[0]))
    expect(BACKDROPS.map.far.filter(name => outdoors.includes(name))).toEqual([])
    expect(props.filter(name => crates.includes(name) || outdoors.includes(name))).toEqual([])
  })
})

describe('the monsters', () => {
  const three: Waypoint[] = ['done', 'now', 'todo']
  const columnsOf = (grid: ReturnType<typeof scene>, color: number): number[] =>
    [...new Set(grid.flatMap(line => line.flatMap((c, x) => (c === color ? [x] : []))))].sort((a, b) => a - b)

  test('none up: neither colour is drawn', () => {
    const grid = scene({ columns: 160, zone: 'arena', waypoints: three, companions: 0, foes: { test: 'none', lint: 'none' }, frame: 0 })
    expect(columnsOf(grid, FOE_COLOR.test)).toEqual([])
    expect(columnsOf(grid, FOE_COLOR.lint)).toEqual([])
  })

  test('a test fight draws the dragon right of the wizard, on the ground, whether fought or standing', () => {
    const road = roadWidth(160, 'arena')
    const hero = avatarX(fitWaypoints(three, flagSlots(road)), road)
    for (const foe of ['fighting', 'standing'] as const) {
      const grid = scene({ columns: 160, zone: 'arena', waypoints: three, companions: 0, foes: { test: foe, lint: 'none' }, frame: 0 })
      const xs = columnsOf(grid, FOE_COLOR.test)
      expect(xs[0]! >= hero + SPRITES.wizard.width).toBe(true)
      expect(xs[xs.length - 1]! < hero + SPRITES.wizard.width + 2 + SPRITES.dragon.width).toBe(true)
      // Its sprite's last row is blank: it stands a pixel above the line, as the pack draws it.
      const lowest = grid.findLastIndex(line => line.some(c => c === FOE_COLOR.test))
      expect(lowest >= GROUND_ROW - 2 && lowest < GROUND_ROW).toBe(true)
      expect(wizardAt(grid, hero, GROUND_ROW - SPRITES.wizard.height)).toBe(true)
    }
  })

  test('both up: the spider stands behind the dragon, further from the wizard', () => {
    const grid = scene({ columns: 160, zone: 'arena', waypoints: three, companions: 0, foes: { test: 'standing', lint: 'fighting' }, frame: 0 })
    const dragon = columnsOf(grid, FOE_COLOR.test)
    const spider = columnsOf(grid, FOE_COLOR.lint)
    expect(dragon.length > 0 && spider.length > 0).toBe(true)
    expect(spider[spider.length - 1]! > dragon[dragon.length - 1]!).toBe(true)
  })

  test('on a short road they close up and keep off the props, though never onto the wizard', () => {
    const hero = 40
    expect(foeX(hero, 200, 2, 1) - foeX(hero, 200, 2, 0)).toBe(SPRITES.dragon.width + 2)
    // 40 + 16 + 2 = 58 to the road's end at 90: room for the dragon and 16 of the spider.
    expect(foeX(hero, 90, 2, 0)).toBe(58)
    expect(foeX(hero, 90, 2, 1)).toBe(74)
    // No room at all: they stand against the wizard, the one behind peeking out by 10.
    expect(foeX(hero, 50, 2, 0)).toBe(hero + SPRITES.wizard.width)
    expect(foeX(hero, 50, 2, 1)).toBe(hero + SPRITES.wizard.width + 10)
  })

  test('frame 1 lifts the monsters with the wizard', () => {
    const at = (frame: 0 | 1) => scene({ columns: 160, zone: 'arena', waypoints: three, companions: 0, foes: { test: 'standing', lint: 'none' }, frame })
    const top = (grid: ReturnType<typeof scene>) => grid.findIndex(line => line.some(c => c === FOE_COLOR.test))
    expect(top(at(1))).toBe(top(at(0)) - 1)
  })

  test('narrow widths still give a full grid with both up', () => {
    for (const columns of [40, 20, 0]) {
      const grid = scene({ columns, zone: 'dungeon', waypoints: three, companions: 2, foes: { test: 'standing', lint: 'standing' }, frame: 1 })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === columns && line.every(c => c !== undefined))).toBe(true)
    }
  })
})

describe('the chest', () => {
  const changed = (a: ReturnType<typeof scene>, b: ReturnType<typeof scene>): number[] =>
    [...new Set(a.flatMap((line, y) => line.flatMap((c, x) => (b[y]?.[x] !== c ? [x] : []))))].sort((p, q) => p - q)

  test('stands left of the props once there is loot, and the road gives it room', () => {
    const none = scene({ columns: 120, zone: 'camp', waypoints: [], companions: 0, loot: 0, frame: 0 })
    const some = scene({ columns: 120, zone: 'camp', waypoints: [], companions: 0, loot: 3, frame: 0 })
    const xs = changed(none, some)
    const propsStart = 120 - 2 - (propsWidth('camp') - 4)
    expect(xs.length > 0).toBe(true)
    expect(xs[0]! >= propsStart - SPRITES.chest.width - 2).toBe(true)
    expect(xs[xs.length - 1]! < propsStart).toBe(true)
    expect(roadWidth(120, 'camp', { loot: 1 })).toBe(roadWidth(120, 'camp') - SPRITES.chest.width - 2)
    expect(roadWidth(120, 'camp', { loot: 0 })).toBe(roadWidth(120, 'camp'))
  })

  test('flags stay clear of it', () => {
    const tasks: Waypoint[] = Array<Waypoint>(MAX_FLAGS).fill('todo')
    const road = roadWidth(120, 'camp', { loot: 1 })
    const flags = fitWaypoints(tasks, flagSlots(road))
    const last = waypointX(flags.length - 1, flags.length, road)
    expect(last + FLAG_WIDTH <= road).toBe(true)
  })
})

describe('the allies', () => {
  const columnsOf = (grid: ReturnType<typeof scene>, color: number): number[] =>
    [...new Set(grid.flatMap(line => line.flatMap((c, x) => (c === color ? [x] : []))))].sort((a, b) => a - b)

  test('the octopus and the fox stand left of the chest, the road giving them room', () => {
    const grid = scene({ columns: 160, zone: 'wilds', waypoints: [], companions: 0, loot: 1, allies: { octopus: true, fox: true }, frame: 0 })
    const octopus = columnsOf(grid, ALLY_COLOR.octopus)
    const fox = columnsOf(grid, ALLY_COLOR.fox)
    const propsStart = 160 - 2 - (propsWidth('wilds') - 4)
    const chestStart = propsStart - SPRITES.chest.width - 2
    expect(octopus.length > 0 && fox.length > 0).toBe(true)
    expect(octopus[octopus.length - 1]! < chestStart).toBe(true)
    expect(fox[fox.length - 1]! < octopus[0]!).toBe(true)
    expect(roadWidth(160, 'wilds', { loot: 1, allies: { octopus: true, fox: true } })).toBe(roadWidth(160, 'wilds') - 3 * (16 + 2))
  })

  test('neither, until they came', () => {
    const grid = scene({ columns: 160, zone: 'wilds', waypoints: [], companions: 0, allies: { octopus: false, fox: false }, frame: 0 })
    expect(columnsOf(grid, ALLY_COLOR.octopus)).toEqual([])
    expect(columnsOf(grid, ALLY_COLOR.fox)).toEqual([])
  })
})

describe('a narrow pane', () => {
  const five: Waypoint[] = ['done', 'done', 'now', 'todo', 'todo']
  const busy = { waypoints: five, foes: { test: 'standing', lint: 'none' }, loot: 1, allies: { octopus: true, fox: true } } as const

  test('nothing gives way where everything fits, so wide scenes stay as they were', () => {
    for (const zone of ZONES) {
      const laid = layout({ columns: 120, zone, waypoints: five })
      expect(laid.props).toEqual(BACKDROPS[zone].props)
      expect(laid.isPacked).toBe(false)
      expect(laid.road).toBe(roadWidth(120, zone))
    }
  })

  test('things give way in order as the pane narrows: props from the left, the fox, the octopus, the chest, the last prop', () => {
    const all = BACKDROPS.dungeon.props
    // How far down the order a layout is, and whether it is a state the order passes through.
    const rank = (laid: ReturnType<typeof layout>): number => {
      const props = laid.props.length
      const fox = laid.extras.allies?.fox === true
      const octopus = laid.extras.allies?.octopus === true
      const chest = (laid.extras.loot ?? 0) > 0
      expect(laid.props).toEqual(all.slice(all.length - props))
      if (props > 1) expect(fox && octopus && chest).toBe(true)
      if (!octopus) expect(fox).toBe(false)
      if (!chest) expect(octopus).toBe(false)
      if (props === 0) expect(chest).toBe(false)
      return (all.length - props) + (fox ? 0 : 1) + (octopus ? 0 : 1) + (chest ? 0 : 1)
    }
    let last = -1
    const seen = new Set<number>()
    for (let columns = 260; columns >= 32; columns--) {
      const r = rank(layout({ columns, zone: 'dungeon', ...busy }))
      expect(r >= last).toBe(true)
      last = r
      seen.add(r)
    }
    expect(seen.has(0)).toBe(true)
    expect(last).toBe(all.length + 3)
  })

  test('at 60 and 80 columns every zone shows three flags clear of the wizard, and the dragon clear of what is kept', () => {
    for (const columns of [60, 80]) {
      for (const zone of ZONES) {
        const laid = layout({ columns, zone, ...busy })
        const flags = fitWaypoints(five, flagSlots(laid.flagRoad))
        const { flagXs, hero, ahead } = figures(flags, laid)
        // Spread flags sit closer than the wizard is wide, so the one after it may stand behind it, as on a wide pane.
        expect(flagXs.filter(x => x + FLAG_WIDTH <= hero || x >= hero + SPRITES.wizard.width).length >= MIN_FLAGS).toBe(true)
        const dragon = foeX(hero, laid.road, 1, 0, ahead)
        const keptRight = laid.props.length > 0 || (laid.extras.loot ?? 0) > 0 || laid.extras.allies?.octopus === true || laid.extras.allies?.fox === true
        if (keptRight) expect(dragon + SPRITES.dragon.width <= laid.road).toBe(true)
        expect(dragon >= hero + SPRITES.wizard.width).toBe(true)
      }
    }
  })

  test('packed flags: those to do stand right after the wizard, the monsters beyond them', () => {
    const { flagXs, hero, ahead } = figures(['done', 'now', 'todo'], { flagRoad: 37, isPacked: true })
    expect(flagXs.slice(0, 2)).toEqual([2, 2 + FLAG_SLOT])
    expect(hero).toBe(2 + FLAG_SLOT + FLAG_WIDTH)
    expect(flagXs[2]).toBe(hero + SPRITES.wizard.width + 1)
    expect(ahead).toBe(flagXs[2]! + FLAG_WIDTH + 1)
  })

  test('a ghost with no room left of the wizard is not drawn, rather than cut at the edge', () => {
    const none = scene({ columns: 50, zone: 'wilds', waypoints: [], companions: 0, frame: 0 })
    const four = scene({ columns: 50, zone: 'wilds', waypoints: [], companions: 4, frame: 0 })
    expect(four).toEqual(none)
  })
})
