// The landscapes' colours, after the claude-rpg banner: a cool slate-blue sky
// and snow, warm stone and wood, green grass, and Claude's terracotta for
// light. The cast's own colours are in sprites.ts.

export const SKY = { top: 0x8ea6bf, bottom: 0xdfeaf0, cloud: 0xeef6f9, cloudShade: 0xc6d8e4 } as const
export const ROCK = { lit: 0x8393aa, shade: 0x687892, snow: 0xeef6f9, snowShade: 0xc6d8e4, cliff: 0x3c415d, cliffLit: 0x4e5677 } as const
export const CASTLE = { wall: 0x948987, shade: 0x766c6c, roof: 0x6c6774, window: 0x3a3440 } as const
export const GRASS = { dark: 0x56783e, mid: 0x6f9451, light: 0x7caa52 } as const
export const COBBLE = { mortar: 0x53556a, stone: 0xa5968e, lit: 0xc2b6ac, shade: 0x857870 } as const
export const WOOD = { dark: 0x4a2e24, mid: 0x6b4a3a, light: 0x8a6448, plank: 0x7a5038, gap: 0x5a3a28 } as const
export const BOOKS: readonly number[] = [0x8a3a2e, 0x3f5a72, 0x8a7a3a, 0x5a3a6a, 0x2f6a4a, 0xa0603a]
export const FIRE = { gold: 0xffd27a, orange: 0xf2a040, red: 0xd9572e, ember: 0xb03a20 } as const
export const STONE = { dark: 0x3a2e2e, wall: 0x5a4a48, lit: 0x7a6660, mortar: 0x2e2424 } as const
export const STEEL = { dark: 0x3a3a44, mid: 0x55555f, lit: 0x7a7a86 } as const
