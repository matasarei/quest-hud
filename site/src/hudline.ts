// scripts/hud-line.sh in TypeScript: the script is bash and jq, which a browser
// cannot run. site/tests/hudline.test.ts holds this to the script's own fixtures.

/** The status-line JSON, as far as the script reads it. */
export type StatusInput = {
  context_window?: { used_percentage?: unknown }
  rate_limits?: {
    seven_day?: { used_percentage?: unknown }
    five_hour?: { used_percentage?: unknown }
  }
  cost?: { total_cost_usd?: unknown }
}

export type LinePart = { text: string; code: number }

const left = (used: number): number => Math.round(Math.min(100, Math.max(0, 100 - used)))

const bar = (value: number): string => {
  const full = Math.round(value / 10)
  return '▰'.repeat(full) + '▱'.repeat(10 - full)
}

const hpCode = (value: number): number => (value < 20 ? 203 : value < 40 ? 221 : 78)

/** Dollars and cents, by the script's own arithmetic rather than `toFixed`'s, so the two round alike. */
const money = (usd: number): string => {
  const cents = Math.round(usd * 100)
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

const isNumber = (value: unknown): value is number => typeof value === 'number'

/** A figure --all can show: anything but a number from zero up is left out, as the script's `figure` does. */
const isFigure = (value: unknown): value is number => isNumber(value) && value >= 0

/** The line's parts, each with the 256-colour code it prints in; `all` is the script's --all. */
export const lineParts = (input: StatusInput, all = false): LinePart[] => {
  const week = input.rate_limits?.seven_day?.used_percentage
  const hp = isNumber(week) ? left(week) : undefined
  // The script's `// 0`: nothing there yet is nothing spent, and false counts as nothing.
  const used = input.context_window?.used_percentage
  const spent = used === undefined || used === null || used === false ? 0 : used
  const mp = isNumber(spent) ? left(spent) : undefined
  const five = input.rate_limits?.five_hour?.used_percentage
  const cost = input.cost?.total_cost_usd

  return [
    ...(hp === undefined ? [] : [{ text: `♥${bar(hp)} ${hp}%`, code: hpCode(hp) }]),
    ...(mp === undefined ? [] : [{ text: `✦${bar(mp)} ${mp}%`, code: 69 }]),
    ...(all && isFigure(five) ? [{ text: `⚡${Math.round(five)}%`, code: 215 }] : []),
    ...(all && isFigure(cost) ? [{ text: `◉$${money(cost)}`, code: 221 }] : []),
  ]
}

/** The line as the script prints it, escape codes and all. */
export const lineText = (input: StatusInput, all = false): string =>
  lineParts(input, all).map(part => `\u001b[38;5;${part.code}m${part.text}\u001b[0m`).join(' ')

/** The screen colours of the codes the script prints: xterm's own 256-colour table. */
export const XTERM: Readonly<Record<number, string>> = { 78: '#5fd787', 221: '#ffd75f', 203: '#ff5f5f', 69: '#5f87ff', 215: '#ffaf5f' }
