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

const ALL = readdirSync(`${DIR}/all`).filter(name => name.endsWith('.json')).map(name => name.replace(/\.json$/, ''))

test('there are --all fixtures to hold the copy to', () => {
  assert.ok(ALL.length >= 6)
})

for (const name of ALL) {
  test(`the --all line matches the script's fixture: ${name}`, () => {
    const input = JSON.parse(readFileSync(`${DIR}/all/${name}.json`, 'utf8'))
    const expected = readFileSync(`${DIR}/all/${name}.expected`, 'utf8').replace(/\n$/, '')
    assert.equal(lineText(input, true).replaceAll(ESC, '@'), expected)
  })
}

test('the --all parts stay off the line without the flag', () => {
  const input = { rate_limits: { five_hour: { used_percentage: 43 } }, cost: { total_cost_usd: 4.29 } }
  assert.doesNotMatch(lineText(input), /⚡|◉/)
  assert.match(lineText(input, true), /⚡43%.*◉\$4\.29/)
})

const script = (input: object, ...args: string[]): string =>
  spawnSync('bash', ['plugins/quest-hud/scripts/hud-line.sh', ...args], { input: JSON.stringify(input), encoding: 'utf8' }).stdout.replace(/\n$/, '')

const hasJq = spawnSync('jq', ['--version']).status === 0

test('the line matches the script itself across the range, half-percents included', { skip: !hasJq }, () => {
  for (let used = 0; used <= 100; used += 0.5) {
    const input = { context_window: { used_percentage: 100 - used }, rate_limits: { seven_day: { used_percentage: used } } }
    assert.equal(lineText(input), script(input), `at ${used}`)
  }
})

test('the --all line matches the script itself, across percents and awkward cents', { skip: !hasJq }, () => {
  for (const five of [0, 0.4, 0.5, 23.5, 99.5, 100, 104.2]) {
    for (const usd of [-0.5, -0.004, 0, 0.004, 0.005, 0.07, 0.1, 0.999, 1.005, 2.675, 4.29, 12.5, 100.1]) {
      const input = { context_window: { used_percentage: 41 }, rate_limits: { seven_day: { used_percentage: 38 }, five_hour: { used_percentage: five } }, cost: { total_cost_usd: usd } }
      assert.equal(lineText(input, true), script(input, '--all'), `at ${five}% and $${usd}`)
    }
  }
})

test('each code has a colour to show', () => {
  for (const used of [0, 61, 81, 100]) {
    const input = { rate_limits: { seven_day: { used_percentage: used }, five_hour: { used_percentage: 1 } }, cost: { total_cost_usd: 1 } }
    for (const part of lineParts(input, true)) assert.ok(XTERM[part.code])
  }
})
