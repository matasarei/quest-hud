// The Road's colours: Claude's warm palette — terracotta, coral and cream on
// deep slate — and, per zone, a sky, a glow and three silhouette tones from
// far to near. Every zone is warm and dark, so the figures read on all of them.
import type { Zone } from '../../types'

export const INK = {
  slate: 0x1f1e1d,
  ink: 0x2b2a27,
  terracotta: 0xd97757,
  crail: 0xc15f3c,
  coral: 0xe8957a,
  cream: 0xf0eee6,
  sand: 0xe3dacc,
  cloudy: 0xb1ada1,
  wood: 0x6b4a3a,
  gold: 0xf2c14e,
  glowGold: 0xffd27a,
} as const

export type ZonePalette = {
  /** The sky (or wall) from its top to the ground line. */
  skyTop: number
  skyBottom: number
  /** A soft light: the moon, a lamp, the forge's mouth. */
  glow: number
  /** Silhouettes, far to near: each a little lighter and warmer than the one behind. */
  far: number
  mid: number
  near: number
  /** The ground band under everything. */
  groundTop: number
  groundBottom: number
}

export const ZONE_PALETTE: Readonly<Record<Zone, ZonePalette>> = {
  wilds: { skyTop: 0x141c1b, skyBottom: 0x2a3631, glow: 0xf0eee6, far: 0x26332f, mid: 0x2f4038, near: 0x3a4d3f, groundTop: 0x3a3a2c, groundBottom: 0x26261d },
  map: { skyTop: 0x241d19, skyBottom: 0x3a2e26, glow: 0xf2c14e, far: 0x33281f, mid: 0x423328, near: 0x553f2f, groundTop: 0x4a3426, groundBottom: 0x2e2018 },
  forge: { skyTop: 0x1e1210, skyBottom: 0x4a2219, glow: 0xd97757, far: 0x2e1a16, mid: 0x3d211b, near: 0x4d2a20, groundTop: 0x3a2620, groundBottom: 0x221613 },
  arena: { skyTop: 0x22181a, skyBottom: 0x4a3028, glow: 0xe8957a, far: 0x33241f, mid: 0x463026, near: 0x5a3c2c, groundTop: 0x6b5038, groundBottom: 0x3e2e22 },
  harbour: { skyTop: 0x10182a, skyBottom: 0x2a3550, glow: 0xf0eee6, far: 0x1c2640, mid: 0x25304d, near: 0x2e3a58, groundTop: 0x2f5d7a, groundBottom: 0x1a3550 },
  watchtower: { skyTop: 0x161b26, skyBottom: 0x33384a, glow: 0xe8957a, far: 0x252a38, mid: 0x2f3545, near: 0x3a4152, groundTop: 0x3a4236, groundBottom: 0x232a22 },
  dungeon: { skyTop: 0x110f14, skyBottom: 0x26202a, glow: 0xd97757, far: 0x1d1922, mid: 0x26212c, near: 0x312a37, groundTop: 0x2e2833, groundBottom: 0x1a1620 },
  camp: { skyTop: 0x141631, skyBottom: 0x332d4a, glow: 0xd97757, far: 0x232442, mid: 0x2c2c4c, near: 0x363457, groundTop: 0x3b2f28, groundBottom: 0x241c18 },
}
