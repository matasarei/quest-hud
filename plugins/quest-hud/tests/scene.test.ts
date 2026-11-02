import { describe, expect, test } from 'claude-code/testing'

import { downsample } from '../src/paint/pixels'
import {
  atRest, avatarX, BAND, bandPortrait, figures, foesOnRoad, foesShown, party, partyAt, FLAG_SLOT, FLAG_WIDTH, fitWaypoints, flagSlots, foeX, GROUND_ROW, layout, MAX_FLAGS, MAX_GHOSTS, MIN_FLAGS, propsWidth,
  nextMotion, REST, roadWidth, scene, sceneArt, SCENE_HEIGHT, SIZE, slide, slideShift, roadside, skyColor, waypointsOf, waypointX, ZONE_PROPS, type Waypoint,
} from '../src/scene'
import { PALETTE, PROPS } from '../src/world/sprites'
import type { Task, Zone } from '../types'

const ZONES: readonly Zone[] = ['watchtower', 'harbour', 'dungeon', 'arena', 'forge', 'map', 'camp', 'wilds']

const task = (id: string, status: Task['status']): Task => ({ id, subject: id, status })

type Scene = ReturnType<typeof scene>

/** The columns a colour shows in. */
const columnsOf = (grid: Scene, color: number): number[] =>
  [...new Set(grid.flatMap(line => line.flatMap((c, x) => (c === color ? [x] : []))))].sort((a, b) => a - b)

/** The columns where two scenes differ. */
const changed = (a: Scene, b: Scene): number[] =>
  [...new Set(a.flatMap((line, y) => line.flatMap((c, x) => (b[y]?.[x] !== c ? [x] : []))))].sort((p, q) => p - q)

// Colours only one figure has, so a test can find it: the wizard's robe, the dragon, the spider, the Octocat's face, the fox.
const ROBE = PALETTE[')'] as number
const DRAGON = PALETTE.n as number
const SPIDER = PALETTE[';'] as number
const OCTOCAT = PALETTE.e as number
const FOX = PALETTE['#'] as number
const FLAG_NOW = PALETTE['6'] as number

const units = (prop: keyof typeof PROPS): number => (PROPS[prop].rows[0]?.length ?? 0) / 2

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
  test('the landmarks keep their space at the right; flags fit what is left', () => {
    expect(roadWidth(120, 'camp')).toBe(120 - (units('campfire') + units('tent') + 4))
    expect(propsWidth('camp')).toBe(units('campfire') + units('tent') + 4)
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

  test('for text cells, the backdrop is dithered in row pairs: halved, it stripes less in every zone; images as before', () => {
    /** Of the pixels that differ from their right neighbour, the share that match the one below: vertical stripes. */
    const striping = (grid: Scene): number => {
      let mixed = 0
      let striped = 0
      for (let y = 0; y + 1 < grid.length; y++) {
        for (let x = 0; x + 1 < (grid[y]?.length ?? 0); x++) {
          if (grid[y]?.[x] === grid[y]?.[x + 1]) continue
          mixed++
          if (grid[y]?.[x] === grid[y + 1]?.[x]) striped++
        }
      }
      return striped / Math.max(1, mixed)
    }
    const SKIES: readonly Zone[] = ['watchtower', 'harbour', 'arena', 'camp', 'wilds']
    for (const zone of ZONES) {
      const args = { columns: 60, zone, waypoints: three, companions: 0 }
      // The top rows as text cells show them, rows halved: where nothing stands.
      const top = (cells?: boolean): Scene => downsample(sceneArt(cells === undefined ? args : { ...args, cells }), 1, 2).slice(0, 8)
      expect([zone, striping(top(true)) < striping(top())]).toEqual([zone, true])
      if (SKIES.includes(zone)) expect([zone, striping(top(true)) < 0.35]).toEqual([zone, true])
      expect(JSON.stringify(sceneArt({ ...args, cells: false }))).toBe(JSON.stringify(sceneArt(args)))
    }
  })

  test('is columns × SCENE_HEIGHT pixels, every pixel filled, in every zone', () => {
    for (const zone of ZONES) {
      const grid = scene({ columns: 90, zone, waypoints: three, companions: 1 })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === 90 && line.every(c => c !== undefined))).toBe(true)
    }
  })

  test('every zone looks its own, and starts with its sky', () => {
    const scenes = ZONES.map(zone => scene({ columns: 80, zone, waypoints: [], companions: 0 }))
    expect(new Set(scenes.map(grid => JSON.stringify(grid))).size).toBe(ZONES.length)
    ZONES.forEach((zone, i) => expect(scenes[i]?.[0]?.[0]).toBe(skyColor(zone)))
  })

  test('the ground starts at GROUND_ROW: below it, no sky shows', () => {
    for (const zone of ZONES) {
      const grid = scene({ columns: 60, zone, waypoints: three, companions: 2 })
      expect(grid.slice(GROUND_ROW).flat().filter(c => c === skyColor(zone))).toEqual([])
    }
  })

  test('the wizard stands just right of the flag in progress, where his robe shows and nowhere else', () => {
    const grid = scene({ columns: 120, zone: 'camp', waypoints: three, companions: 0 })
    const laid = layout({ columns: 120, zone: 'camp', waypoints: three })
    const { hero } = figures(fitWaypoints(three, flagSlots(laid.flagRoad)), laid)
    const robe = columnsOf(grid, ROBE)
    expect(robe.length > 0).toBe(true)
    expect(robe[0]! >= hero && robe[robe.length - 1]! < hero + SIZE.wizard).toBe(true)
  })

  test('no tasks: the wizard near the left, Claude\'s mascot still at his heel', () => {
    const grid = scene({ columns: 80, zone: 'wilds', waypoints: [], companions: 0 })
    const robe = columnsOf(grid, ROBE)
    expect(robe[0]! >= 6 && robe[robe.length - 1]! < 6 + SIZE.wizard).toBe(true)
    expect(columnsOf(grid, PALETTE.a as number).some(x => x < 6)).toBe(true)
  })

  test('a pose and a hop change only the wizard and the mascot at his heel', () => {
    const still = scene({ columns: 120, zone: 'forge', waypoints: three, companions: 2 })
    const lifted = scene({ columns: 120, zone: 'forge', waypoints: three, companions: 2, motion: { step: 0, pose: 'walk1', hop: true } })
    const laid = layout({ columns: 120, zone: 'forge', waypoints: three })
    const { hero } = figures(fitWaypoints(three, flagSlots(laid.flagRoad)), laid)
    const xs = changed(still, lifted)
    expect(xs.length > 0).toBe(true)
    expect(xs.every(x => x >= hero - 6 && x < hero + SIZE.wizard)).toBe(true)
  })

  test('the flag in progress flies its gold pennant', () => {
    const grid = scene({ columns: 120, zone: 'map', waypoints: ['now'], companions: 0 })
    const laid = layout({ columns: 120, zone: 'map', waypoints: ['now'] })
    const x0 = waypointX(0, 1, laid.flagRoad)
    const pennant = grid.slice(GROUND_ROW - 14, GROUND_ROW).flatMap(line => line.slice(x0, x0 + FLAG_WIDTH))
    expect(pennant.some(c => c === FLAG_NOW)).toBe(true)
  })

  test('ghosts are drawn up to MAX_GHOSTS', () => {
    // The flag in progress far along the road, so all the ghosts have room behind the wizard.
    const road: Waypoint[] = ['done', 'done', 'done', 'done', 'now']
    const none = scene({ columns: 160, zone: 'wilds', waypoints: road, companions: 0 })
    const many = scene({ columns: 160, zone: 'wilds', waypoints: road, companions: MAX_GHOSTS + 3 })
    const four = scene({ columns: 160, zone: 'wilds', waypoints: road, companions: MAX_GHOSTS })
    expect(changed(none, many).length > 0).toBe(true)
    expect(changed(four, many)).toEqual([])
  })

  test('narrow widths still give a full grid, clipped', () => {
    for (const columns of [24, 8, 0]) {
      const grid = scene({ columns, zone: 'harbour', waypoints: three, companions: 3, motion: { step: 3, pose: 'walk1', hop: true } })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === columns)).toBe(true)
    }
  })
})

describe('the monsters', () => {
  const three: Waypoint[] = ['done', 'now', 'todo']
  const at = (foes: { test: 'none' | 'fighting' | 'standing'; lint: 'none' | 'fighting' | 'standing' }) =>
    scene({ columns: 160, zone: 'arena', waypoints: three, companions: 0, foes })

  test('none up: neither is drawn', () => {
    const grid = at({ test: 'none', lint: 'none' })
    expect(columnsOf(grid, DRAGON)).toEqual([])
    expect(columnsOf(grid, SPIDER)).toEqual([])
  })

  test('a test fight draws the dragon right of the wizard, whether fought or standing', () => {
    const laid = layout({ columns: 160, zone: 'arena', waypoints: three })
    const { hero } = figures(fitWaypoints(three, flagSlots(laid.flagRoad)), laid)
    for (const foe of ['fighting', 'standing'] as const) {
      const xs = columnsOf(at({ test: foe, lint: 'none' }), DRAGON)
      expect(xs.length > 0).toBe(true)
      expect(xs[0]! >= hero + SIZE.wizard).toBe(true)
      expect(xs[xs.length - 1]! < hero + SIZE.wizard + 2 + SIZE.foe).toBe(true)
    }
  })

  test('both up: the spider stands behind the dragon, further from the wizard', () => {
    const grid = at({ test: 'standing', lint: 'fighting' })
    const dragon = columnsOf(grid, DRAGON)
    const spider = columnsOf(grid, SPIDER)
    expect(dragon.length > 0 && spider.length > 0).toBe(true)
    expect(spider[spider.length - 1]! > dragon[dragon.length - 1]!).toBe(true)
  })

  test('on a short road they close up and keep off the landmarks, though never onto the wizard', () => {
    const hero = 40
    expect(foeX(hero, 200, 2, 1) - foeX(hero, 200, 2, 0)).toBe(SIZE.foe + 2)
    // 40 + 16 + 2 = 58 to the road's end at 90: room for the dragon and 16 of the spider.
    expect(foeX(hero, 90, 2, 0)).toBe(58)
    expect(foeX(hero, 90, 2, 1)).toBe(74)
    // No room at all: they stand against the wizard, the one behind peeking out by 10.
    expect(foeX(hero, 50, 2, 0)).toBe(hero + SIZE.wizard)
    expect(foeX(hero, 50, 2, 1)).toBe(hero + SIZE.wizard + 10)
  })

  test('with no room past the flags ahead, they stand in front of them, never past the road\'s end', () => {
    // Four tasks packed: the wizard at 21–37, the upcoming flags up to 47.
    expect(foeX(21, 56, 1, 0, 47)).toBe(40)
    expect([0, 1].map(i => foeX(21, 66, 2, i, 47))).toEqual([40, 50])
    // Short by 3 for a 10 peek: the one behind closes up to what fits.
    expect([0, 1].map(i => foeX(21, 60, 2, i, 47))).toEqual([37, 44])
  })

  test('foesShown: both while the one behind can peek out by 6, else only the nearest', () => {
    expect(foesShown(21, 59, ['test', 'lint'])).toEqual(['test', 'lint'])
    expect(foesShown(21, 58, ['test', 'lint'])).toEqual(['test'])
    expect(foesShown(21, 40, ['lint'])).toEqual(['lint'])
    expect(foesShown(21, 40, [])).toEqual([])
  })

  test('narrow widths still give a full grid with both up', () => {
    for (const columns of [40, 20, 0]) {
      const grid = scene({ columns, zone: 'dungeon', waypoints: three, companions: 2, foes: { test: 'standing', lint: 'standing' }, motion: { step: 3, pose: 'walk1', hop: true } })
      expect(grid).toHaveLength(SCENE_HEIGHT)
      expect(grid.every(line => line.length === columns && line.every(c => c !== undefined))).toBe(true)
    }
  })
})

describe('the monsters on a narrow road', () => {
  const ZONES_ALL: readonly Zone[] = ['watchtower', 'harbour', 'dungeon', 'arena', 'forge', 'map', 'camp', 'wilds']
  const TASKS: readonly Waypoint[] = ['done', 'done', 'now', 'todo', 'todo', 'todo']
  const FOES = [{ test: 'standing', lint: 'none' }, { test: 'none', lint: 'standing' }, { test: 'standing', lint: 'standing' }] as const

  test('every monster drawn stays inside the road, wherever the wizard leaves room for one', () => {
    // Dense where the road runs short, a few wide panes past it: a sweep that stays well inside
    // the 5-second test limit on a slow CI runner (the full 40–200 in steps of 2 took 12 s there).
    const WIDTHS = [...Array.from({ length: 21 }, (_, i) => 40 + i * 4), 140, 170, 200]
    let checked = 0
    for (const zone of ZONES_ALL) {
      for (const columns of WIDTHS) {
        for (const n of [0, 1, 3, 4, 6]) {
          for (const foes of FOES) {
            for (const extras of [{}, { loot: 2, allies: { octopus: true, fox: true } }]) {
              const { hero, road, shown } = foesOnRoad({ columns, zone, waypoints: TASKS.slice(0, n), companions: 1, foes, ...extras })
              const wall = hero + SIZE.wizard
              if (wall + SIZE.foe > road) continue
              checked++
              for (const { x } of shown) expect([zone, columns, n, x >= wall && x + SIZE.foe <= road]).toEqual([zone, columns, n, true])
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(500)
  })

  test('60 columns, four tasks, both up: the test\'s monster whole, the spider not drawn', () => {
    const args = { columns: 60, zone: 'dungeon', waypoints: TASKS.slice(0, 4), companions: 0, foes: { test: 'standing', lint: 'standing' } } as const
    expect(foesOnRoad(args).shown).toEqual([{ kind: 'test', x: 40 }])
    const grid = scene(args)
    expect(columnsOf(grid, PALETTE[';'] as number)).toEqual([])
    expect(columnsOf(grid, PALETTE['3'] as number).length).toBeGreaterThan(0)
  })
})

describe('the monster of a test run, by zone', () => {
  const three: Waypoint[] = ['done', 'now', 'todo']
  const at = (zone: Zone, foes: { test: 'none' | 'standing'; lint: 'none' | 'standing' }) => scene({ columns: 120, zone, waypoints: three, companions: 0, foes })
  // Each room's monster by a colour of its own, in no foe-free scene of that room: the skull's red eyes, the golem's glowing core, the red book's cover.
  const ROOMS: ReadonlyArray<readonly [Zone, number]> = [['dungeon', PALETTE['3'] as number], ['forge', PALETTE.Y as number], ['map', PALETTE['-'] as number]]
  const OUTDOORS: readonly Zone[] = ['wilds', 'camp', 'harbour', 'watchtower', 'arena']
  const SPIDER = PALETTE[';'] as number

  test('in each room its own monster, not the dragon', () => {
    for (const [zone, mark] of ROOMS) {
      expect([zone, columnsOf(at(zone, { test: 'none', lint: 'none' }), mark)]).toEqual([zone, []])
      const grid = at(zone, { test: 'standing', lint: 'none' })
      expect([zone, columnsOf(grid, mark).length > 0, columnsOf(grid, DRAGON)]).toEqual([zone, true, []])
    }
  })

  test('outdoors the dragon, as before', () => {
    for (const zone of OUTDOORS) expect([zone, columnsOf(at(zone, { test: 'standing', lint: 'none' }), DRAGON).length > 0]).toEqual([zone, true])
  })

  test('the lint spider everywhere, the same', () => {
    const ZONES_ALL: readonly Zone[] = [...ROOMS.map(([zone]) => zone), ...OUTDOORS]
    for (const zone of ZONES_ALL) {
      expect([zone, columnsOf(at(zone, { test: 'none', lint: 'none' }), SPIDER)]).toEqual([zone, []])
      expect([zone, columnsOf(at(zone, { test: 'none', lint: 'standing' }), SPIDER).length > 0]).toEqual([zone, true])
    }
  })
})

describe('the chest', () => {
  test('stands left of the landmarks once there is loot, and the road gives it room', () => {
    const none = scene({ columns: 120, zone: 'camp', waypoints: [], companions: 0, loot: 0 })
    const some = scene({ columns: 120, zone: 'camp', waypoints: [], companions: 0, loot: 3 })
    const xs = changed(none, some)
    const propsStart = 120 - 2 - (propsWidth('camp') - 4)
    expect(xs.length > 0).toBe(true)
    expect(xs[0]! >= propsStart - SIZE.extra - 2).toBe(true)
    expect(xs[xs.length - 1]! < propsStart).toBe(true)
    expect(roadWidth(120, 'camp', { loot: 1 })).toBe(roadWidth(120, 'camp') - SIZE.extra - 2)
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
  test('the Octocat and the fox stand left of the chest, the road giving them room', () => {
    const grid = scene({ columns: 160, zone: 'wilds', waypoints: [], companions: 0, loot: 1, allies: { octopus: true, fox: true } })
    const octocat = columnsOf(grid, OCTOCAT)
    const fox = columnsOf(grid, FOX)
    const propsStart = 160 - 2 - (propsWidth('wilds') - 4)
    const chestStart = propsStart - SIZE.extra - 2
    expect(octocat.length > 0 && fox.length > 0).toBe(true)
    expect(octocat[octocat.length - 1]! < chestStart).toBe(true)
    expect(fox[fox.length - 1]! < octocat[0]!).toBe(true)
    // The chest is 16 units wide, the Octocat and the fox 10 each, each with its gap of 2.
    expect(roadWidth(160, 'wilds', { loot: 1, allies: { octopus: true, fox: true } })).toBe(roadWidth(160, 'wilds') - (SIZE.extra + 2) - 2 * (10 + 2))
  })

  test('they move on the mascot\'s hop: the Octocat wiggles its tentacles, the fox hops', () => {
    const at = (hop: boolean) => scene({ columns: 160, zone: 'wilds', waypoints: [], companions: 0, loot: 1, allies: { octopus: true, fox: true }, motion: { step: 0, pose: 'stand', hop } })
    const [down, up] = [at(false), at(true)]
    const rowsOf = (grid: Scene, color: number) => grid.flatMap((line, y) => (line.includes(color) ? [y] : []))
    // The fox's top row rises; the Octocat's face stays where it was.
    expect(rowsOf(up, FOX)[0]! < rowsOf(down, FOX)[0]!).toBe(true)
    expect(rowsOf(up, OCTOCAT)).toEqual(rowsOf(down, OCTOCAT))
    expect(changed(up, down).length > 0).toBe(true)
  })

  test('neither, until they came', () => {
    const grid = scene({ columns: 160, zone: 'wilds', waypoints: [], companions: 0, allies: { octopus: false, fox: false } })
    expect(columnsOf(grid, OCTOCAT)).toEqual([])
    expect(columnsOf(grid, FOX)).toEqual([])
  })
})

describe('a narrow pane', () => {
  const five: Waypoint[] = ['done', 'done', 'now', 'todo', 'todo']
  const busy = { waypoints: five, foes: { test: 'standing', lint: 'none' }, loot: 1, allies: { octopus: true, fox: true } } as const

  test('nothing gives way where everything fits, so wide scenes stay as they were', () => {
    for (const zone of ZONES) {
      const laid = layout({ columns: 120, zone, waypoints: five })
      expect(laid.props).toEqual(ZONE_PROPS[zone])
      expect(laid.isPacked).toBe(false)
      expect(laid.road).toBe(roadWidth(120, zone))
    }
  })

  test('things give way in order as the pane narrows: landmarks from the left, the fox, the Octocat, the chest, the last landmark', () => {
    const all = ZONE_PROPS.dungeon
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
        expect(flagXs.filter(x => x + FLAG_WIDTH <= hero || x >= hero + SIZE.wizard).length >= MIN_FLAGS).toBe(true)
        const dragon = foeX(hero, laid.road, 1, 0, ahead)
        const keptRight = laid.props.length > 0 || (laid.extras.loot ?? 0) > 0 || laid.extras.allies?.octopus === true || laid.extras.allies?.fox === true
        if (keptRight) expect(dragon + SIZE.foe <= laid.road).toBe(true)
        expect(dragon >= hero + SIZE.wizard).toBe(true)
      }
    }
  })

  test('packed flags: those to do stand right after the wizard, the monsters beyond them', () => {
    const { flagXs, hero, ahead } = figures(['done', 'now', 'todo'], { flagRoad: 37, isPacked: true })
    expect(flagXs.slice(0, 2)).toEqual([2, 2 + FLAG_SLOT])
    expect(hero).toBe(2 + FLAG_SLOT + FLAG_WIDTH)
    expect(flagXs[2]).toBe(hero + SIZE.wizard + 1)
    expect(ahead).toBe(flagXs[2]! + FLAG_WIDTH + 1)
  })

  test('a ghost with no room left of the wizard is not drawn, rather than cut at the edge', () => {
    const none = scene({ columns: 50, zone: 'wilds', waypoints: [], companions: 0 })
    const four = scene({ columns: 50, zone: 'wilds', waypoints: [], companions: 4 })
    expect(four).toEqual(none)
  })
})

describe('the walk', () => {
  test('each frame is a step further and the next of four poses, the mascot hopping every other frame', () => {
    let motion = REST
    const poses: string[] = []
    for (let tick = 1; tick <= 8; tick++) {
      motion = nextMotion(motion, tick, false)
      poses.push(`${motion.pose}${motion.hop ? '^' : ''}`)
    }
    expect(motion.step).toBe(8)
    expect(poses).toEqual(['walk1^', 'walk2', 'walk3^', 'walk0', 'walk1^', 'walk2', 'walk3^', 'walk0'])
  })

  test('in a fight the wizard stops, and strikes and stands in turn', () => {
    const walked = { step: 5, pose: 'walk2', hop: false } as const
    expect(nextMotion(walked, 6, true)).toEqual({ step: 5, pose: 'strike', hop: false })
    expect(nextMotion(walked, 7, true)).toEqual({ step: 5, pose: 'stand', hop: false })
    expect(atRest({ step: 9, pose: 'walk3', hop: true })).toEqual({ step: 9, pose: 'stand', hop: false })
  })

  test('a step moves the landscape behind everyone', () => {
    const at = (step: number) => scene({ columns: 120, zone: 'wilds', waypoints: ['done', 'now'], companions: 0, motion: { step, pose: 'stand', hop: false } })
    const xs = changed(at(0), at(1))
    expect(xs.length > 60).toBe(true)
  })
})

describe('a zone change', () => {
  test('slide: the old landscape goes out to the left as the new one comes in from the right', () => {
    const from = [[1, 2, 3, 4]]
    const to = [[5, 6, 7, 8]]
    expect(slide(from, to, 0)).toEqual([[1, 2, 3, 4]])
    expect(slide(from, to, 0.5)).toEqual([[3, 4, 5, 6]])
    expect(slide(from, to, 1)).toEqual([[5, 6, 7, 8]])
  })

  test('slideShift: how far the old scene has gone out, in pixels, the same for everything that slides', () => {
    expect([0, 0.25, 0.5, 1, -1, 2].map(p => slideShift(200, p))).toEqual([0, 50, 100, 200, 0, 200])
    expect(slideShift(5, 0.5)).toBe(3)
  })

  test('the scene slides only its landscape: at the start the old zone\'s sky, at the end the new scene', () => {
    const args = { columns: 100, zone: 'wilds', waypoints: ['done', 'now'], companions: 0 } as const
    const plain = scene(args)
    const start = scene({ ...args, transition: { from: 'camp', progress: 0 } })
    const end = scene({ ...args, transition: { from: 'camp', progress: 1 } })
    expect(start[0]).toEqual(scene({ ...args, zone: 'camp' })[0])
    expect(end).toEqual(plain)
    const half = scene({ ...args, transition: { from: 'camp', progress: 0.5 } })
    expect(half[0]?.slice(0, 50)).toEqual(scene({ ...args, zone: 'camp' })[0]?.slice(50))
  })
})

describe('the landmarks in a zone change', () => {
  const args = { columns: 100, zone: 'arena', waypoints: ['done', 'now'], companions: 0, loot: 1 } as const
  const WIDTH = 100 * 2

  test('at its start the frame is the old zone\'s scene, landmarks and chest included; at its end the new one\'s', () => {
    expect(JSON.stringify(sceneArt({ ...args, transition: { from: 'camp', progress: 0 } }))).toBe(JSON.stringify(sceneArt({ ...args, zone: 'camp' })))
    expect(JSON.stringify(sceneArt({ ...args, transition: { from: 'camp', progress: 1 } }))).toBe(JSON.stringify(sceneArt(args)))
  })

  test('the old zone\'s roadside goes out with its backdrop, the new one\'s comes in with its own, kept to their sides of the seam', () => {
    const still = (zone: 'camp' | 'arena') => roadside({ ...args, zone })
    for (const progress of [0.25, 0.5, 0.75]) {
      const shift = slideShift(WIDTH, progress)
      const seam = WIDTH - shift
      const out = still('camp').map(t => ({ ...t, x: t.x - shift, to: seam }))
      const into = still('arena').map(t => ({ ...t, x: t.x + seam, from: seam }))
      expect(roadside({ ...args, transition: { from: 'camp', progress } })).toEqual([...out, ...into])
    }
  })

  test('with no slide under way, the roadside is the zone\'s own, over the whole width', () => {
    const things = roadside(args)
    expect(things.length).toBe(3)
    expect(things.every(t => t.from === 0 && t.to === WIDTH)).toBe(true)
    expect(roadside({ ...args, transition: { from: 'arena', progress: 0.5 } })).toEqual(things)
  })
})

describe('the party in a zone change', () => {
  const ZONES_ALL: readonly Zone[] = ['watchtower', 'harbour', 'dungeon', 'arena', 'forge', 'map', 'camp', 'wilds']
  const TASKS: readonly Waypoint[] = ['done', 'done', 'now', 'todo', 'todo', 'todo', 'todo', 'todo']
  const base = (columns: number, n: number) => ({ columns, waypoints: TASKS.slice(0, n), companions: 2, foes: { test: 'standing', lint: 'none' }, loot: 2, allies: { octopus: true, fox: false } }) as const

  test('at its start the party stands where the old zone has it; at its end where the new one does', () => {
    let moved = 0
    for (const from of ZONES_ALL) {
      for (const to of ZONES_ALL) {
        if (from === to) continue
        for (const [columns, n] of [[80, 3], [80, 5], [120, 5], [160, 8]] as const) {
          const args = { ...base(columns, n), zone: to }
          const old = party({ ...args, zone: from })
          if (JSON.stringify(old) !== JSON.stringify(party(args))) moved++
          expect([from, to, columns, n, JSON.stringify(partyAt({ ...args, transition: { from, progress: 0 } })) === JSON.stringify(old)]).toEqual([from, to, columns, n, true])
          expect([from, to, columns, n, JSON.stringify(partyAt({ ...args, transition: { from, progress: 1 } })) === JSON.stringify(party(args))]).toEqual([from, to, columns, n, true])
        }
      }
    }
    expect(moved).toBeGreaterThan(20)
  })

  test('the first frame of a slide is the old scene, the last the new one, pixel for pixel', () => {
    for (const [from, to, columns] of [['wilds', 'forge', 80], ['wilds', 'forge', 120], ['camp', 'dungeon', 80]] as const) {
      const args = { ...base(columns, 5), zone: to }
      expect(JSON.stringify(sceneArt({ ...args, transition: { from, progress: 0 } }))).toBe(JSON.stringify(sceneArt({ ...args, zone: from })))
      expect(JSON.stringify(sceneArt({ ...args, transition: { from, progress: 1 } }))).toBe(JSON.stringify(sceneArt(args)))
    }
  })

  test('glide: the wizard and a same-size set of flags walk; a different-size set swaps at half', () => {
    const at = (columns: number, n: number, progress: number) => partyAt({ ...base(columns, n), zone: 'forge', transition: { from: 'wilds', progress } })
    const [old, now] = [party({ ...base(120, 5), zone: 'wilds' }), party({ ...base(120, 5), zone: 'forge' })]
    expect(old.flags.length).toBe(now.flags.length)
    for (const p of [0.25, 0.5, 0.75]) {
      expect(at(120, 5, p).hero).toBe(old.hero + (now.hero - old.hero) * p)
      expect(at(120, 5, p).flags.map(f => f.x)).toEqual(old.flags.map((f, i) => f.x + ((now.flags[i]?.x ?? 0) - f.x) * p))
    }
    const [few, many] = [party({ ...base(80, 5), zone: 'wilds' }), party({ ...base(80, 5), zone: 'forge' })]
    expect(few.flags.length === many.flags.length).toBe(false)
    expect(at(80, 5, 0.25).flags.length).toBe(few.flags.length)
    expect(at(80, 5, 0.5).flags.length).toBe(many.flags.length)
  })

  test('a room\'s monster takes over at half: wilds to dungeon, the dragon, then the skeleton', () => {
    const args = { ...base(120, 3), zone: 'dungeon' } as const
    const [dragon, skeleton] = [party({ ...args, zone: 'wilds' }).foes[0]?.grid, party(args).foes[0]?.grid]
    expect(JSON.stringify(dragon) === JSON.stringify(skeleton)).toBe(false)
    expect(partyAt({ ...args, transition: { from: 'wilds', progress: 0.25 } }).foes[0]?.grid).toEqual(dragon)
    expect(partyAt({ ...args, transition: { from: 'wilds', progress: 0.5 } }).foes[0]?.grid).toEqual(skeleton)
  })
})

describe('the landmarks on the walk', () => {
  const at = (step: number, loot = 0) =>
    scene({ columns: 120, zone: 'wilds', waypoints: [], companions: 0, loot, motion: { step, pose: 'stand', hop: false } })
  const LEAF = PALETTE['0'] as number
  const CHEST_WOOD = PALETTE.N as number

  test('pass by with the near layer as the wizard walks, and come round again', () => {
    const start = columnsOf(at(0), LEAF)
    expect(start.length > 0).toBe(true)
    expect(columnsOf(at(1), LEAF)[0]).toBe(start[0]! - 4)
    // One loop: the road's width, the landmarks' own, and twelve units of open road, four units a step.
    const loop = (120 + units('bush') + units('signpost') + 12) / 4
    expect(columnsOf(at(loop), LEAF)).toEqual(start)
  })

  test('the chest stands by the road too: it passes by with the landmarks', () => {
    const start = columnsOf(at(0, 1), CHEST_WOOD)
    expect(start.length > 0).toBe(true)
    expect(columnsOf(at(1, 1), CHEST_WOOD)[0]).toBe(start[0]! - 4)
  })

  test('GitHub\'s Octocat walks with the party: it keeps its place', () => {
    const party = (step: number) => scene({ columns: 160, zone: 'wilds', waypoints: [], companions: 0, loot: 1, allies: { octopus: true, fox: false }, motion: { step, pose: 'stand', hop: false } })
    expect(columnsOf(party(5), OCTOCAT)).toEqual(columnsOf(party(0), OCTOCAT))
  })
})

describe('the band\'s wizard', () => {
  test('casts while the Road walks: the orb flaring on every other frame, and in a fight', () => {
    const rest = JSON.stringify(bandPortrait('stand'))
    expect(JSON.stringify(bandPortrait('walk0'))).toBe(rest)
    expect(JSON.stringify(bandPortrait('walk1')) === rest).toBe(false)
    expect(JSON.stringify(bandPortrait('walk3'))).toBe(JSON.stringify(bandPortrait('walk1')))
    expect(JSON.stringify(bandPortrait('strike'))).toBe(JSON.stringify(bandPortrait('walk1')))
  })

  test('is art: 20 × 12, two pixels a column and four a row, for 10 × 3 cells', () => {
    const portrait = bandPortrait()
    expect([portrait[0]?.length, portrait.length]).toEqual([BAND.columns * 2, BAND.rows * 4])
  })
})
