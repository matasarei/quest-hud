// scripts/hud-line.sh in TypeScript: the script is bash and jq, which a browser
// cannot run. site/tests/hudline.test.ts holds this to the script's own fixtures.

/** The status-line JSON, as far as the script reads it. */
export type StatusInput = {
  context_window?: { used_percentage?: number | null }
  rate_limits?: { seven_day?: { used_percentage?: number | null } }
}

export type LinePart = { text: string; code: number }

const left = (used: number): number => Math.round(Math.min(100, Math.max(0, 100 - used)))

const bar = (value: number): string => {
  const full = Math.round(value / 10)
  return '▰'.repeat(full) + '▱'.repeat(10 - full)
}

const hpCode = (value: number): number => (value < 20 ? 203 : value < 40 ? 221 : 78)

/** The line's parts, each with the 256-colour code it prints in. */
export const lineParts = (input: StatusInput): LinePart[] => {
  const week = input.rate_limits?.seven_day?.used_percentage
  const hp = week === undefined || week === null ? undefined : left(week)
  const mp = left(input.context_window?.used_percentage ?? 0)

  return [
    ...(hp === undefined ? [] : [{ text: `♥${bar(hp)} ${hp}%`, code: hpCode(hp) }]),
    { text: `✦${bar(mp)} ${mp}%`, code: 69 },
  ]
}

/** The line as the script prints it, escape codes and all. */
export const lineText = (input: StatusInput): string =>
  lineParts(input).map(part => `\u001b[38;5;${part.code}m${part.text}\u001b[0m`).join(' ')

/** The screen colours of the codes the script prints: xterm's own 256-colour table. */
export const XTERM: Readonly<Record<number, string>> = { 78: '#5fd787', 221: '#ffd75f', 203: '#ff5f5f', 69: '#5f87ff' }
