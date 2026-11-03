import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'

import { lineParts, lineText, XTERM } from '../src/hudline'

const DIR = 'plugins/quest-hud/tests/statusline'
const SCENARIOS = readdirSync(DIR).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/, ''))
const ESC = String.fromCharCode(27)

test('there are fixtures to hold the copy to', () => {
  assert.ok(SCENARIOS.length >= 8)
})

for (const name of SCENARIOS) {
  test(`the line matches the script's fixture: ${name}`, () => {
    const input = JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf8'))
    const expected = readFileSync(`${DIR}/${name}.expected`, 'utf8').replace(/\n$/, '')
    assert.equal(lineText(input).replaceAll(ESC, '@'), expected)
  })
}

const script = (input: object): string =>
  spawnSync('bash', ['plugins/quest-hud/scripts/hud-line.sh'], { input: JSON.stringify(input), encoding: 'utf8' }).stdout.replace(/\n$/, '')

const hasJq = spawnSync('jq', ['--version']).status === 0

test('the line matches the script itself across the range, half-percents included', { skip: !hasJq }, () => {
  for (let used = 0; used <= 100; used += 0.5) {
    const input = { context_window: { used_percentage: 100 - used }, rate_limits: { seven_day: { used_percentage: used } } }
    assert.equal(lineText(input), script(input), `at ${used}`)
  }
})

test('each code has a colour to show', () => {
  for (const used of [0, 61, 81, 100]) {
    for (const part of lineParts({ rate_limits: { seven_day: { used_percentage: used } } })) assert.ok(XTERM[part.code])
  }
})
