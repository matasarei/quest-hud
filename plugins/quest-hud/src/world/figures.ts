// The Road's figures, built from shapes: the wizard and his poses, Claude's
// mascot at his heel, ghosts, flags, the monsters, the chest, and the allies
// gh and glab bring. Each stands in a box `FOOTPRINT[name]` units wide and
// FIGURE_HEIGHT tall, feet on the box's bottom, facing right; the scene places
// and mirrors them. Our own flat drawings, not logo files. Pure.
import type { Picture, Shape } from '../paint/picture'
import { INK } from './palette'

export const FIGURE_HEIGHT = 16

export const FOOTPRINT = {
  wizard: 16,
  familiar: 10,
  ghost: 16,
  flag: 8,
  dragon: 16,
  spider: 16,
  octocat: 16,
  tanuki: 16,
  chest: 16,
} as const

export type Pose = 'stand' | 'walk0' | 'walk1' | 'walk2' | 'walk3' | 'strike'
export const POSES: readonly Pose[] = ['stand', 'walk0', 'walk1', 'walk2', 'walk3', 'strike']
/** The walk's poses, in order: a frame index picks one. */
export const WALK: readonly Pose[] = ['walk0', 'walk1', 'walk2', 'walk3']

const G = FIGURE_HEIGHT
const robeFill = { top: 0xe08a6a, bottom: INK.crail, y0: 6, y1: G }

/** The wizard: a tall hat with a spark, a terracotta robe, a white beard, and a staff with a glowing tip. */
export const wizard = (pose: Pose = 'stand'): Picture => {
  const step = pose.startsWith('walk') ? Number(pose.slice(4)) : -1
  const bob = step === 1 || step === 3 ? -0.5 : 0
  const sway = step === 0 ? 0.6 : step === 2 ? -0.6 : 0
  const isStrike = pose === 'strike'
  const feet: Shape[] = step < 0
    ? [{ kind: 'ellipse', cx: 6.3, cy: G - 0.6, rx: 1.4, ry: 0.6, fill: INK.ink }, { kind: 'ellipse', cx: 9.7, cy: G - 0.6, rx: 1.4, ry: 0.6, fill: INK.ink }]
    : [
        { kind: 'ellipse', cx: 8 + [1.8, 0.6, -1.8, -0.6][step]!, cy: G - 0.6, rx: 1.4, ry: 0.6, fill: INK.ink },
        { kind: 'ellipse', cx: 8 + [-1.8, -0.6, 1.8, 0.6][step]!, cy: G - 0.6 + (step % 2 === 1 ? -0.4 : 0), rx: 1.4, ry: 0.6, fill: INK.ink },
      ]
  const staff: Shape[] = isStrike
    ? [
        { kind: 'capsule', x1: 10, y1: 12 + bob, x2: 14, y2: 2.8, r: 0.45, fill: INK.wood },
        { kind: 'ellipse', cx: 14, cy: 2.4, rx: 1.95, ry: 2.3, fill: INK.glowGold, opacity: 0.4 },
        { kind: 'ellipse', cx: 14, cy: 2.4, rx: 1.3, ry: 1.3, fill: INK.glowGold },
        { kind: 'capsule', x1: 9.5, y1: 9.8 + bob, x2: 12.8, y2: 7, r: 0.8, fill: INK.terracotta },
      ]
    : [
        { kind: 'capsule', x1: 13.2 + sway * 0.5, y1: G - 0.5, x2: 13.4, y2: 5.5 + bob, r: 0.45, fill: INK.wood },
        { kind: 'ellipse', cx: 13.4, cy: 5 + bob, rx: 2.2, ry: 2.2, fill: INK.glowGold, opacity: 0.25 },
        { kind: 'ellipse', cx: 13.4, cy: 5 + bob, rx: 1.15, ry: 1.15, fill: INK.glowGold },
        { kind: 'capsule', x1: 9.6, y1: 10.5 + bob, x2: 13.2, y2: 10 + bob, r: 0.8, fill: INK.terracotta },
      ]
  return [
    { kind: 'polygon', points: [[3 + sway, G - 1], [13 + sway, G - 1], [9.8, 7.5 + bob], [6.2, 7.5 + bob]], fill: robeFill },
    ...feet,
    { kind: 'rect', x: 5.6, y: 11.6 + bob, w: 4.8, h: 0.8, fill: INK.cream, opacity: 0.85 },
    { kind: 'ellipse', cx: 8, cy: 6.4 + bob, rx: 2.4, ry: 2.2, fill: INK.sand },
    { kind: 'polygon', points: [[5.9, 6.8 + bob], [10.1, 6.8 + bob], [8.4, 11.4 + bob]], fill: INK.cream },
    { kind: 'ellipse', cx: 8.9, cy: 6 + bob, rx: 0.35, ry: 0.4, fill: INK.ink },
    { kind: 'ellipse', cx: 8, cy: 4.5 + bob, rx: 4.6, ry: 0.9, fill: INK.crail },
    { kind: 'polygon', points: [[5.2, 4.5 + bob], [10.8, 4.5 + bob], [6.6, 0 + bob]], fill: INK.terracotta },
    { kind: 'polygon', points: [[8, 1.6 + bob], [8.35, 2.6 + bob], [9.3, 2.9 + bob], [8.35, 3.2 + bob], [8, 4.2 + bob], [7.65, 3.2 + bob], [6.7, 2.9 + bob], [7.65, 2.6 + bob]], fill: INK.cream },
    ...staff,
  ]
}

/**
 * Claude's mascot, as the wizard's familiar: a small terracotta creature with
 * two dark eyes, little arms and four short legs. `hop` lifts it.
 */
export const familiar = (hop = false): Picture => {
  const y = hop ? -1.5 : 0
  const legs: Shape[] = [2.2, 4, 6, 7.8].map((x): Shape => ({ kind: 'rect', x: x - 0.5, y: G - 2.4 + y, w: 1, h: 2.4 - (hop ? 0.8 : 0), fill: INK.crail }))
  return [
    ...legs,
    { kind: 'rect', x: 1.4, y: G - 7.6 + y, w: 7.2, h: 5.4, fill: INK.terracotta },
    { kind: 'rect', x: 0, y: G - 5.6 + y, w: 1.6, h: 1.4, fill: INK.terracotta },
    { kind: 'rect', x: 8.4, y: G - 5.6 + y, w: 1.6, h: 1.4, fill: INK.terracotta },
    { kind: 'rect', x: 3.2, y: G - 6.2 + y, w: 0.9, h: 1.6, fill: INK.slate },
    { kind: 'rect', x: 5.9, y: G - 6.2 + y, w: 0.9, h: 1.6, fill: INK.slate },
  ]
}

/** A subagent's ghost: a pale rounded shape with a wavy hem, half seen through. */
export const ghost = (): Picture => [
  { kind: 'ellipse', cx: 8, cy: 7, rx: 5.2, ry: 5, fill: 0xcfd6e4, opacity: 0.55 },
  { kind: 'polygon', points: [[2.8, 7], [13.2, 7], [13.2, 14.6], [11.5, 13.2], [9.8, 14.6], [8, 13.2], [6.2, 14.6], [4.5, 13.2], [2.8, 14.6]], fill: 0xcfd6e4, opacity: 0.55 },
  { kind: 'ellipse', cx: 6.4, cy: 7, rx: 0.7, ry: 0.9, fill: INK.slate, opacity: 0.7 },
  { kind: 'ellipse', cx: 9.6, cy: 7, rx: 0.7, ry: 0.9, fill: INK.slate, opacity: 0.7 },
]

export type FlagState = 'done' | 'now' | 'todo'
export const FLAG_COLOR: Readonly<Record<FlagState, number>> = { done: 0x7fb685, now: INK.gold, todo: 0x8a8579 }

/** A task's flag: a pole and a pennant in its state's colour. */
export const flag = (state: FlagState): Picture => [
  { kind: 'capsule', x1: 1.5, y1: G - 0.35, x2: 1.5, y2: 7.5, r: 0.35, fill: INK.cloudy },
  { kind: 'polygon', points: [[1.8, 7.6], [7.4, 9.4], [1.8, 11.2]], fill: FLAG_COLOR[state] },
]

/** The dragon of a failed test run: a coral beast with a wing, a long neck, horns and a tail. */
export const dragon = (): Picture => [
  { kind: 'capsule', x1: 1, y1: 13, x2: 5, y2: 11.5, r: 0.9, fill: 0xa8432f },
  { kind: 'ellipse', cx: 7.5, cy: 11.5, rx: 4.5, ry: 3.2, fill: 0xc8553d },
  { kind: 'ellipse', cx: 7.8, cy: 12.8, rx: 3, ry: 1.6, fill: 0xe8957a },
  { kind: 'polygon', points: [[5.5, 9], [9, 8.6], [6.5, 2.5], [4.6, 5.5], [2.5, 4.5]], fill: 0xa8432f },
  { kind: 'capsule', x1: 10.5, y1: 10.5, x2: 12.8, y2: 6, r: 1.1, fill: 0xc8553d },
  { kind: 'ellipse', cx: 13.6, cy: 5.2, rx: 2.3, ry: 1.6, fill: 0xc8553d },
  { kind: 'polygon', points: [[12.6, 4], [12.2, 1.8], [13.4, 3.7]], fill: INK.cream },
  { kind: 'ellipse', cx: 14.3, cy: 4.8, rx: 0.4, ry: 0.4, fill: INK.gold },
  { kind: 'rect', x: 5, y: 14, w: 1.4, h: 2, fill: 0xa8432f },
  { kind: 'rect', x: 9, y: 14, w: 1.4, h: 2, fill: 0xa8432f },
]

/** The spider of a failed lint run: a round dark body, eight legs and red eyes. */
export const spider = (): Picture => {
  const legs: Shape[] = [-1, 1].flatMap(side =>
    [0, 1, 2, 3].flatMap((i): Shape[] => {
      const knee: [number, number] = [8 + side * (3.4 + i * 1), 5.6 + i * 1.2]
      return [
        { kind: 'capsule', x1: 8 + side * 1.8, y1: 8.6 + i * 0.8, x2: knee[0], y2: knee[1], r: 0.38, fill: 0x3a2440 },
        { kind: 'capsule', x1: knee[0], y1: knee[1], x2: 8 + side * (4 + i * 1.1), y2: 15.6, r: 0.38, fill: 0x3a2440 },
      ]
    }),
  )
  return [
    ...legs,
    { kind: 'ellipse', cx: 8, cy: 9.8, rx: 3.6, ry: 3, fill: 0x4a2c4f },
    { kind: 'ellipse', cx: 8, cy: 6.6, rx: 2.2, ry: 1.8, fill: 0x4a2c4f },
    { kind: 'ellipse', cx: 7.2, cy: 6.4, rx: 0.45, ry: 0.45, fill: 0xe85a4f },
    { kind: 'ellipse', cx: 8.8, cy: 6.4, rx: 0.45, ry: 0.45, fill: 0xe85a4f },
  ]
}

/**
 * GitHub's Octocat, as our own drawing: a dark cat's head with pointed ears
 * and a pale face, and curling octopus arms below.
 */
export const octocat = (): Picture => {
  const dark = 0x24292f
  const arms: Shape[] = [3, 5.5, 10.5, 13].map((x, i): Shape => ({
    kind: 'capsule', x1: 8 + (x - 8) * 0.4, y1: 11, x2: x, y2: 15.2 - (i % 2) * 0.6, r: 0.75, fill: dark,
  }))
  return [
    ...arms,
    { kind: 'ellipse', cx: 8, cy: 8, rx: 5.6, ry: 4.6, fill: dark },
    { kind: 'polygon', points: [[3, 6.5], [3.6, 1.6], [6.6, 4]], fill: dark },
    { kind: 'polygon', points: [[13, 6.5], [12.4, 1.6], [9.4, 4]], fill: dark },
    { kind: 'ellipse', cx: 8, cy: 8.9, rx: 4, ry: 2.7, fill: 0xf1cdbf },
    { kind: 'ellipse', cx: 6.4, cy: 8.7, rx: 0.75, ry: 1.05, fill: dark },
    { kind: 'ellipse', cx: 9.6, cy: 8.7, rx: 0.75, ry: 1.05, fill: dark },
    { kind: 'ellipse', cx: 6.6, cy: 8.3, rx: 0.25, ry: 0.3, fill: 0xffffff },
    { kind: 'ellipse', cx: 9.8, cy: 8.3, rx: 0.25, ry: 0.3, fill: 0xffffff },
    { kind: 'ellipse', cx: 8, cy: 10.1, rx: 0.45, ry: 0.3, fill: 0xd98a8a },
  ]
}

/**
 * GitLab's tanuki, as our own drawing: the faceted head in GitLab's orange,
 * coral and yellow, on short legs.
 */
export const tanuki = (): Picture => {
  const red = 0xe24329
  const orange = 0xfc6d26
  const yellow = 0xfca326
  return [
    { kind: 'rect', x: 5.2, y: 13, w: 1.6, h: 3, fill: 0xb2361f },
    { kind: 'rect', x: 9.2, y: 13, w: 1.6, h: 3, fill: 0xb2361f },
    { kind: 'polygon', points: [[2, 2], [4.4, 7.6], [1, 7.6]], fill: red },
    { kind: 'polygon', points: [[14, 2], [11.6, 7.6], [15, 7.6]], fill: red },
    { kind: 'polygon', points: [[1, 7.6], [4.4, 7.6], [8, 13.8]], fill: yellow },
    { kind: 'polygon', points: [[15, 7.6], [11.6, 7.6], [8, 13.8]], fill: yellow },
    { kind: 'polygon', points: [[4.4, 7.6], [11.6, 7.6], [8, 13.8]], fill: red },
    { kind: 'polygon', points: [[2, 2], [4.4, 7.6], [8, 13.8], [1, 7.6]], fill: orange, opacity: 0.55 },
    { kind: 'polygon', points: [[14, 2], [11.6, 7.6], [8, 13.8], [15, 7.6]], fill: orange, opacity: 0.55 },
  ]
}

/** Loot: a wooden chest with a gold band and lock. */
export const chest = (): Picture => [
  { kind: 'rect', x: 2, y: 9, w: 12, h: 7, fill: 0x8a5a3c },
  { kind: 'ellipse', cx: 8, cy: 9, rx: 6, ry: 2.6, fill: 0x9c6a48 },
  { kind: 'rect', x: 2, y: 9, w: 12, h: 1, fill: INK.gold },
  { kind: 'rect', x: 7.2, y: 9.6, w: 1.6, h: 2.2, fill: INK.gold },
  { kind: 'rect', x: 2, y: 14.6, w: 12, h: 0.6, fill: 0x5a3a28 },
]
