// Which zone a skill's work happens in, from the skill's name and description
// alone. Deterministic: the same skill always lands in the same zone.
import type { Zone } from '../types'

export const ZONES: readonly Zone[] = ['watchtower', 'harbour', 'dungeon', 'arena', 'forge', 'map', 'camp', 'wilds']

/** The keyword rules, in the order they are tried: the first match wins. */
const RULES: ReadonlyArray<readonly [Zone, readonly string[]]> = [
  ['harbour', ['pr', 'mr', 'merge', 'release', 'ship', 'deploy', 'publish']],
  ['dungeon', ['audit', 'security']],
  ['arena', ['review', 'verify', 'test', 'lint', 'check', 'qa']],
  ['forge', ['implement', 'build', 'fix', 'refactor', 'feature', 'migrate']],
  ['map', ['plan', 'design', 'spec', 'brainstorm', 'research', 'investigate']],
  ['camp', ['init', 'setup', 'config', 'docs', 'memory']],
]

const PULL_REQUEST = /\bpull[\s-]+requests?\b/i

export type ZoneOverrides = ReadonlyMap<string, Zone>

export const isZone = (value: string): value is Zone => (ZONES as readonly string[]).includes(value)

/** Lower-cased whole words: `pr-review` → `pr`, `review`; `print` stays `print`. */
export const tokens = (text: string): string[] => text.toLowerCase().split(/[^a-z0-9]+/).filter(word => word !== '')

/** The skill's own name, without the `plugin:` prefix a plugin's skill carries. */
const bareName = (skill: string): string => skill.slice(skill.lastIndexOf(':') + 1)

/**
 * The `zones` option, `name=zone, name=zone`: a name is a skill's full name or
 * the part after its `plugin:` prefix. An entry naming no known zone is skipped.
 */
export const parseZones = (option: string): ZoneOverrides => {
  const overrides = new Map<string, Zone>()

  for (const entry of option.split(',')) {
    const parts = entry.split('=')
    const [name, zone] = parts.map(part => part.trim().toLowerCase())

    if (parts.length === 2 && name && zone && isZone(zone)) {
      overrides.set(name, zone)
    }
  }

  return overrides
}

const firstRule = (words: readonly string[], isPullRequest = false): Zone | undefined => {
  for (const [zone, keywords] of RULES) {
    if (keywords.some(keyword => words.includes(keyword)) || (zone === 'harbour' && isPullRequest)) {
      return zone
    }
  }

  return undefined
}

/**
 * The zone for a skill: an override first, then Watchtower for a name that
 * holds both `review` and `pr`/`mr`, then the rules against the name, then
 * against the description, and the Wilds when nothing matched or no skill runs.
 */
export const zoneFor = (skill: string | undefined, description = '', overrides: ZoneOverrides = new Map()): Zone => {
  const full = (skill ?? '').trim().toLowerCase()

  if (full === '') {
    return 'wilds'
  }

  const bare = bareName(full)
  const chosen = overrides.get(full) ?? overrides.get(bare)

  if (chosen) {
    return chosen
  }

  const name = tokens(bare)

  if (name.includes('review') && (name.includes('pr') || name.includes('mr'))) {
    return 'watchtower'
  }

  return firstRule(name) ?? firstRule(tokens(description), PULL_REQUEST.test(description)) ?? 'wilds'
}
