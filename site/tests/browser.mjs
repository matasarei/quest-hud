// Drives the built page in a real Chrome and checks what a visitor would see.
// No dependencies: Node's own WebSocket and Chrome's DevTools protocol. Run by
// site/tests/smoke.sh, which serves _site/ and finds Chrome:
//   node site/tests/browser.mjs <url> <chrome>
// It waits on conditions rather than fixed times, so a slow machine is slower and
// not flaky. A check that something did not happen waits for a later beat of Play,
// so the page's own time has passed however slow the machine is.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [url, chromePath] = process.argv.slice(2)
if (!url || !chromePath) {
  console.error('usage: browser.mjs <url> <chrome>')
  process.exit(2)
}

const WAIT_MS = 20_000
/** Play a session has about 29 seconds of beats of its own. */
const PLAY_MS = 90_000
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

let passed = 0
const failures = []
const ok = (name, value, detail = '') => {
  if (value) passed += 1
  else failures.push(detail === '' ? name : `${name}: ${detail}`)
}

// Chrome, on a port it chooses and writes to its profile.
const profile = mkdtempSync(join(tmpdir(), 'quest-hud-browser-'))
const chrome = spawn(chromePath, ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' })

const finish = code => {
  chrome.kill()
  // Chrome may still be writing to its profile as it exits: a leftover temp folder is no failure.
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 3 }) } catch {}
  process.exit(code)
}

const untilValue = async (read, what, ms = WAIT_MS) => {
  const end = Date.now() + ms
  for (;;) {
    try {
      const value = await read()
      if (value) return value
    } catch {}
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(50)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => finish(1))

let socket
try {
  const port = await untilValue(() => readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0], "Chrome's port")
  // Chrome can answer before its first page exists, so an empty list is no answer yet.
  const target = await untilValue(async () => (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(page => page.type === 'page'), "Chrome's page")
  socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = () => reject(new Error("could not reach Chrome's page"))
  })
} catch (error) {
  console.error(`browser: ${error.message}`)
  finish(1)
}

// Chrome going away mid-run would otherwise leave a check waiting for ever.
socket.onclose = () => {
  console.error('browser: Chrome went away')
  finish(1)
}

let nextId = 0
const waiting = new Map()
const consoleErrors = []
const requests = []
socket.onmessage = message => {
  const data = JSON.parse(message.data)
  if (data.id !== undefined) {
    waiting.get(data.id)?.(data)
    waiting.delete(data.id)
  }
  if (data.method === 'Runtime.exceptionThrown') consoleErrors.push(data.params.exceptionDetails.exception?.description ?? 'an exception')
  if (data.method === 'Log.entryAdded' && data.params.entry.level === 'error') consoleErrors.push(data.params.entry.text)
  if (data.method === 'Network.requestWillBeSent') requests.push(data.params.request.url)
}

const send = (method, params = {}) => new Promise(resolve => {
  nextId += 1
  waiting.set(nextId, resolve)
  socket.send(JSON.stringify({ id: nextId, method, params }))
})

const ev = async expression => {
  const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (reply.result.exceptionDetails) throw new Error(`${expression}: ${reply.result.exceptionDetails.exception?.description ?? 'failed'}`)
  return reply.result.result.value
}

/** Waits until the expression is true; false when it never is, so a check can report it. */
const until = async (expression, ms = WAIT_MS) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await ev(expression)) return true
    await sleep(50)
  }
  return false
}

// Counts the page's timers, as the mod's rule is one at most.
const TIMERS = `(() => {
  const set = window.setInterval, clear = window.clearInterval
  window.__timers = new Map()
  window.__mostTimers = 0
  window.setInterval = (fn, ms, ...rest) => {
    const id = set(fn, ms, ...rest)
    window.__timers.set(id, ms)
    window.__mostTimers = Math.max(window.__mostTimers, window.__timers.size)
    return id
  }
  window.clearInterval = id => { window.__timers.delete(id); clear(id) }
})()`

for (const domain of ['Runtime', 'Log', 'Page', 'Network']) await send(`${domain}.enable`)
await send('Page.addScriptToEvaluateOnNewDocument', { source: TIMERS })

/** Linux and Windows scrollbars take width, where macOS overlays them: check the harder case everywhere. */
const CLASSIC_SCROLLBARS = '::-webkit-scrollbar { width: 15px; height: 15px }'

/** Linux has no macOS system font, and its fallback wraps the page's text onto more lines. */
const WIDE_FONT = 'body { font-family: Verdana, "DejaVu Sans", sans-serif !important }'

/** A fresh page at a size. */
const load = async (width, height, reduced = false) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] })
  // The old page is marked first: a reload has the same address, and it already says it is ready.
  await ev('window.__leaving = true')
  await send('Page.navigate', { url })
  await untilValue(() => ev(`document.documentElement.dataset.ready === 'yes' && !window.__leaving`), 'the page')
  for (const rule of [CLASSIC_SCROLLBARS, WIDE_FONT]) await ev(`document.styleSheets[0].insertRule(${JSON.stringify(rule)}, 0)`)
}

const text = id => ev(`document.getElementById(${JSON.stringify(id)}).textContent`)
const shown = selector => ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return !!e && e.getClientRects().length > 0 })()`)
const pick = (name, value) => ev(`document.querySelector('input[name=${name}][value=${value}]').click()`)
const click = id => ev(`document.getElementById(${JSON.stringify(id)}).click()`)
const slide = (id, value) => ev(`(() => { const i = document.getElementById('${id}'); i.value = ${value}; i.dispatchEvent(new Event('input')) })()`)
const command = name => ev(`[...document.querySelectorAll('.command')].find(b => b.textContent === '${name}').click()`)
const firstLine = () => ev(`document.querySelector('#band .text')?.textContent`)
const hpColour = slot => ev(`[...document.querySelectorAll('${slot} .text')].find(e => e.textContent.includes('♥')).style.color`)
const lineColour = () => ev(`document.querySelector('#status-line span').style.color`)
const timers = () => ev('[...window.__timers.values()]')
const isPlaying = () => ev(`document.getElementById('play').textContent === 'Stop'`)

const OPENING = 'The anvil is hot. Strike while it lasts.'
/** Play's third beat: about 2.6 seconds of the page's own time in. */
const LATER_BEAT = `document.getElementById('transcript').textContent.includes('> /gku:implement')`

const section = async (name, run) => {
  try {
    await run()
  } catch (error) {
    failures.push(`${name}: ${error.message}`)
  }
}

await section('controls', async () => {
  await load(1280, 800)
  ok('only the install box takes text', (await ev(`document.querySelectorAll('input[type=text]').length`)) === 1)
  ok('five settings', (await ev(`document.querySelectorAll('.setting').length`)) === 5)
  ok('no timer while idle', (await timers()).length === 0)
})

await section('settings', async () => {
  await load(1280, 800)
  await pick('detail', 'off')
  ok('detail off: no band', !(await text('band')).includes('HP'))
  ok('detail off: no Road', !(await shown('#pane')))
  ok('detail off: the hint is the engine\'s', (await text('hint')) === '? for shortcuts')
  await pick('detail', 'status')
  ok('detail status: bars on the hint', /♥▰*▱* 62%/.test(await text('hint')), await text('hint'))
  ok('detail status: no band', !(await text('band')).includes('HP'))
  await pick('detail', 'band')
  ok('detail band: the band', (await text('band')).includes('♥ HP'))
  ok('detail band: no Road', !(await shown('#pane')))
  await pick('detail', 'pane')
  ok('detail pane: the Road', await shown('#road img.picture'))

  await pick('bars', 'all')
  ok('bars all: 5-hour left, its reset and the cost on the band', /⏾ 66% · \d\d:\d\d.*◉ ?\$1\.84/.test(await text('band')), await text('band'))
  ok('bars all: on the status line too', /⏾ 66% · \d\d:\d\d ◉\$1\.84/.test(await text('status-line')), await text('status-line'))
  await pick('bars', 'hpmp')
  ok('bars hpmp: neither', !/⏾|◉/.test((await text('band')) + (await text('status-line'))))
  await slide('hp', 80)
  ok('bars hpmp: the 5-hour window once it binds, below HP', /⏾ 66% · \d\d:\d\d/.test(await text('band')) && /⏾ 66% · \d\d:\d\d/.test(await text('status-line')), await text('band'))
  ok('bars hpmp: still no cost', !/◉/.test((await text('band')) + (await text('status-line'))))
  await slide('hp', 62)

  const portrait = () => ev(`document.querySelector('#band canvas').toDataURL()`)
  const portraits = [await portrait()]
  await pick('avatar', 'claude')
  portraits.push(await portrait())
  await pick('avatar', 'octocat')
  portraits.push(await portrait())
  ok('three avatars, three portraits', new Set(portraits).size === 3)
  await pick('avatar', 'wizard')

  await pick('graphics', 'cells')
  ok('graphics cells: a canvas', (await shown('#road canvas.cells')) && !(await shown('#road img')))
  await pick('graphics', 'images')
  ok('graphics images: a picture', await shown('#road img.picture'))
  await pick('graphics', 'auto')
  ok('graphics auto: a picture, with its note', (await shown('#road img.picture')) && (await shown('#graphics-note')))
})

await section('HP colours', async () => {
  await load(1280, 800)
  const cases = [[40, 'rgb(79, 211, 122)', 'rgb(95, 215, 135)'], [39, 'rgb(242, 209, 91)', 'rgb(255, 215, 95)'], [20, 'rgb(242, 209, 91)', 'rgb(255, 215, 95)'], [19, 'rgb(239, 83, 80)', 'rgb(255, 95, 95)']]
  for (const [hp, band, line] of cases) {
    await slide('hp', hp)
    ok(`HP ${hp}: the band`, (await hpColour('#band')) === band, await hpColour('#band'))
    ok(`HP ${hp}: the Road`, (await hpColour('#road')) === band, await hpColour('#road'))
    ok(`HP ${hp}: the status line`, (await lineColour()) === line, await lineColour())
  }
})

await section('flavour line', async () => {
  await load(1280, 800)
  ok('opens on the zone\'s line', (await firstLine()) === OPENING, await firstLine())
  const tops = await ev(`(() => [...document.querySelectorAll('#band .text')].slice(0, 2).map(e => e.getBoundingClientRect().top))()`)
  ok('sits above the quest', tops[1] > tops[0], JSON.stringify(tops))
  const height = () => ev(`document.getElementById('band').getBoundingClientRect().height`)
  const withLine = await height()
  await pick('flavor', 'off')
  ok('off: the quest comes first', (await firstLine()).includes('gku:implement'), await firstLine())
  ok('no taller with it than without', Math.abs(withLine - (await height())) < 1)
  await pick('flavor', 'on')
  await slide('mp', 12)
  ok('MP low: a tip', (await firstLine()).startsWith('MP runs low'), await firstLine())
  await slide('mp', 59)
  await slide('hp', 10)
  ok('HP low: a tip', (await firstLine()).startsWith('HP runs low'), await firstLine())
})

await section('commands', async () => {
  await load(1280, 800)
  const expected = [['status', 'Forge —'], ['help', 'now pane (default band)'], ['statusline', 'hud-line.sh'], ['level-up', 'No level yet'], ['level', '⚔ Level'], ['level-up', 'Commands are printed']]
  for (const [name, words] of expected) {
    await command(name)
    ok(`${name} answers`, (await text('transcript')).includes(words))
  }
  ok('the level shows on the Road', /Lv \d+/.test(await text('road')))
  await command('off')
  ok('off hides the HUD', !(await shown('#pane')) && !(await text('band')).includes('HP'))
  await command('on')
  ok('on brings it back', (await shown('#road')) && (await text('band')).includes('HP'))
  await command('quests')
  ok('the board fills', await until(`document.getElementById('board').textContent.includes('example/shop')`))
  ok('the board is labelled', await shown('#pane-example'))
  ok('the board\'s links go nowhere', (await ev(`document.querySelectorAll('#board a').length`)) === 0)
  await ev(`document.querySelector('#board button.plain').click()`)
  ok('the fold opens', (await text('board')).includes('Hide 2 Trivial'))
  await click('pane-close')
  ok('closing the board shows the Road', await shown('#road'))
})

await section('the flag caption', async () => {
  await load(1280, 800)
  ok('says what flags need', (await text('flag-note')) === 'One flag per task. They appear only when Claude uses its task list.', await text('flag-note'))
  ok('shows with the Road', await shown('#flag-note'))
  await pick('detail', 'band')
  ok('hides without it', !(await shown('#flag-note')))
  await command('pane')
  ok('returns with /quest-hud:pane', await shown('#flag-note'))
  await command('quests')
  ok('hides behind the Quest Board', !(await shown('#flag-note')))
})

await section('how to switch', async () => {
  await load(1280, 800)
  ok('closed at first', !(await ev(`document.querySelector('.howto').open`)))
  await ev(`document.querySelector('.howto summary').click()`)
  ok('opens, and names the flag', (await ev(`document.querySelector('.howto').open`)) && (await ev(`document.querySelector('.howto').textContent`)).includes('hud-line.sh --all'))
})

await section('Play a session', async () => {
  await load(1280, 800)
  await pick('bars', 'all')
  // The page records every band it draws, so no line goes unseen however slow this script runs.
  await ev(`(() => {
    window.__lines = new Set()
    window.__colours = new Set()
    new MutationObserver(() => {
      const line = document.querySelector('#band .text')
      const hp = [...document.querySelectorAll('#band .text')].find(e => e.textContent.includes('♥'))
      if (line) window.__lines.add(line.textContent)
      if (hp) window.__colours.add(hp.style.color)
    }).observe(document.getElementById('band'), { childList: true })
  })()`)
  await click('play')
  const figures = async () => {
    const found = /⏾ (\d+)%.*◉ ?\$([\d.]+)/.exec(await text('band'))
    return [Number(found[1]), Number(found[2])]
  }
  const before = await figures()
  ok('a turn walks, on one timer at the mod\'s pace', await until(`window.__timers.size === 1 && [...window.__timers.values()][0] === 250`))
  await untilValue(async () => !(await isPlaying()), 'Play to end', PLAY_MS)
  const colours = new Set(await ev('[...window.__colours]'))
  const lines = new Set(await ev('[...window.__lines]'))
  const after = await figures()
  ok('HP goes through all three colours', colours.size === 3, [...colours].join(', '))
  ok('the 5-hour window left falls', after[0] < before[0], `${before} to ${after}`)
  ok('the cost rises', after[1] > before[1], `${before} to ${after}`)
  ok('a monster tip', lines.has('The monster stands until the tests pass.'))
  ok('an MP tip', [...lines].some(line => line.startsWith('MP runs low')))
  ok('an HP tip', [...lines].some(line => line.startsWith('HP runs low')))
  ok('several lines', lines.size >= 8, String(lines.size))
  ok('the status line agrees with the band', (await text('status-line')).includes(`⏾ ${after[0]}%`) && (await text('status-line')).includes(`◉$${after[1].toFixed(2)}`), await text('status-line'))
  ok('one timer at most', (await ev('window.__mostTimers')) === 1)
  ok('at rest, no timer', await until('window.__timers.size === 0'))
  ok('the log has the fight and the loot', /tests lost/.test(await text('road')) && /loot/.test(await text('road')))
})

await section('stopping Play', async () => {
  // A scene's pixels by colour, to tell whether a monster stands in it.
  const colours = `(async () => {
    const image = document.querySelector('#road img')
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    context.drawImage(image, 0, 0)
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data
    const counts = {}
    for (let i = 0; i < data.length; i += 4) {
      const colour = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
      counts[colour] = (counts[colour] ?? 0) + 1
    }
    return counts
  })()`
  await load(1280, 800)
  await click('play')
  await until(`document.getElementById('transcript').textContent.includes('Edited src/csv.ts')`)
  const calm = await ev(colours)
  await until(`document.getElementById('transcript').textContent.includes('$ npm test')`)
  const newColours = counts => Object.keys(counts).filter(colour => !calm[colour] && counts[colour] > 8)
  const pixels = (counts, colours) => colours.reduce((sum, colour) => sum + (counts[colour] ?? 0), 0)
  // The monster draws with the next frame: wait for it, rather than for a time.
  const fighting = await untilValue(async () => {
    const counts = await ev(colours)
    return pixels(counts, newColours(counts)) > 200 ? counts : undefined
  }, 'the monster')
  await click('play')
  const monster = newColours(fighting)
  ok('the fight shows a monster', pixels(fighting, monster) > 200)
  const stopped = await ev(colours)
  ok('Stop clears it', pixels(stopped, monster) < pixels(fighting, monster) * 0.1, `${pixels(stopped, monster)} of ${pixels(fighting, monster)}`)

  await load(1280, 800)
  await command('quests')
  await click('play')
  // This beat of Play comes after the herald would have returned.
  ok('Play reaches its skill', await until(LATER_BEAT))
  ok('the herald stays out of a new session', !(await text('transcript')).includes('The board is posted'))
  await click('play')
})

await section('copying the install command', async () => {
  await load(1280, 800)
  await send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await click('copy-install')
  ok('Copy answers', await until(`['Copied', 'Selected'].includes(document.getElementById('copy-install').textContent)`), await text('copy-install'))
})

await section('layout', async () => {
  await load(390, 844)
  ok('phone: the Road below the transcript', await ev(`document.getElementById('pane').getBoundingClientRect().top >= document.getElementById('transcript').getBoundingClientRect().bottom - 1`))
  await load(1000, 800)
  ok('wide: the Road beside the transcript', await ev(`document.getElementById('pane').getBoundingClientRect().left >= document.getElementById('transcript').getBoundingClientRect().right - 2`))
  await load(240, 800)
  ok('too narrow: no scene, and its text stays', !(await shown('#road img')) && (await text('road')).includes('♥'))
})

await section('reduced motion', async () => {
  await load(1280, 800, true)
  await click('play')
  // Claude has been working for a while by this beat of Play: a walk would have started.
  ok('Play reaches its skill', await until(LATER_BEAT))
  ok('Play runs with no timer', (await isPlaying()) && (await ev('window.__mostTimers')) === 0)
  await click('play')
})

await section('the band fits', async () => {
  for (const width of [1920, 1600, 1440, 1366, 1320, 1319, 1280, 1250, 1249, 1100, 1000, 934, 800, 600, 390]) {
    await load(width, 800)
    await pick('bars', 'all')
    const room = await ev(`(() => {
      const band = document.getElementById('band')
      const road = document.getElementById('road')
      const scene = road.querySelector('img, canvas')
      return { over: band.scrollWidth - band.clientWidth, roadOver: road.scrollWidth - road.clientWidth, sceneOver: scene ? scene.getBoundingClientRect().right - road.getBoundingClientRect().right : 0 }
    })()`)
    ok(`${width} px: the band's figures fit`, room.over <= 0, `${room.over} px over`)
    ok(`${width} px: the Road fits its pane`, room.roadOver <= 0 && room.sceneOver <= 1, JSON.stringify(room))
  }
})

// The band takes the form a terminal that wide would: nothing scrolls sideways, and only a long task is cut.
const bandRows = () => ev(`(() => {
  const band = document.getElementById('band')
  const rows = [...band.querySelectorAll('.column > .row')]
  const pieces = glyph => [...(rows.find(row => row.textContent.includes(glyph))?.querySelectorAll('.text') ?? [])]
  const isCut = piece => piece.scrollWidth > piece.clientWidth
  return {
    over: band.scrollWidth - band.clientWidth,
    bars: pieces('♥').map(piece => piece.textContent).join(''),
    barsCut: pieces('♥').filter(isCut).length,
    questCut: pieces('⚔').slice(0, -1).filter(isCut).length,
  }
})()`)

await section('the band in the room it has', async () => {
  for (const width of [360, 600, 768]) {
    for (const bars of ['hpmp', 'all']) {
      await load(width, 900)
      await pick('bars', bars)
      const seen = await bandRows()
      ok(`${width} px, ${bars}: the band does not scroll sideways`, seen.over <= 0, `${seen.over} px over`)
      ok(`${width} px, ${bars}: both percentages show`, /♥.*\d+%.*✦.*\d+%/.test(seen.bars), seen.bars)
      ok(`${width} px, ${bars}: nothing in the bars is cut`, seen.barsCut === 0, seen.bars)
      ok(`${width} px, ${bars}: only the task may be cut in the quest row`, seen.questCut === 0)
      if (bars === 'all') ok(`${width} px: the 5-hour window and the cost stay`, /⏾.*◉/.test(seen.bars), seen.bars)
    }
  }

  await load(1280, 800)
  ok('at 1280 px the row has its heal time', (await bandRows()).bars.includes('heals'), (await bandRows()).bars)
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 900, deviceScaleFactor: 1, mobile: false })
  ok('narrowing the window redraws it', await until(`!document.getElementById('band').textContent.includes('heals')`))
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  ok('widening the window brings it back', await until(`document.getElementById('band').textContent.includes('heals')`))
})

// Every control in reach with the view on screen, at each size: the page's main promise.
await section('the view stays on screen', async () => {
  for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 800], [1280, 680], [1250, 800], [1249, 800], [1100, 800], [1000, 800], [768, 1024], [390, 844], [360, 640]]) {
    await load(width, height)
    const count = await ev(`[...document.querySelectorAll('.controls button, .controls input')].map((e, i) => { e.dataset.check = i; return i }).length`)
    const hidden = []
    const covered = []
    for (let i = 0; i < count; i += 1) {
      const seen = await ev(`(() => {
        const element = document.querySelector('[data-check="${i}"]')
        const control = element.closest('label') ?? element
        control.scrollIntoView({ block: 'nearest' })
        const stage = document.querySelector('.stage')
        // Stacked, the pinned view can sit over a control: read the layout, not a width that copies the CSS.
        if (getComputedStyle(document.querySelector('.layout')).gridTemplateColumns.split(' ').length === 1) {
          const covers = stage.getBoundingClientRect().bottom - control.getBoundingClientRect().top
          if (covers > 0) scrollBy(0, -covers - 8)
        }
        const box = control.getBoundingClientRect()
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
        const band = document.getElementById('band').getBoundingClientRect()
        return {
          name: element.id || element.value || element.textContent,
          isHit: !!hit && (control === hit || control.contains(hit) || hit.contains(control)),
          isBandShown: band.top >= -1 && band.bottom <= innerHeight + 1,
        }
      })()`)
      if (!seen.isBandShown) hidden.push(seen.name)
      if (!seen.isHit) covered.push(seen.name)
    }
    ok(`${width}x${height}: the band is on screen beside every control`, hidden.length === 0, hidden.join(', '))
    ok(`${width}x${height}: every control can be reached`, covered.length === 0, covered.join(', '))
    ok(`${width}x${height}: no sideways page scroll`, (await ev('document.documentElement.scrollWidth')) <= width)
  }
})

await section('what the page promises', async () => {
  await load(1280, 680)
  ok('says so on a short screen too', (await ev(`document.querySelector('footer').textContent`)).includes('Nothing here is sent anywhere'))
  const outside = requests.filter(address => !address.startsWith(url) && !address.startsWith('data:') && address !== 'about:blank')
  ok('no outside requests', outside.length === 0, outside.join(', '))
  ok('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '))
  ok('no error recorded', (await ev('document.documentElement.dataset.error')) === undefined)
})

for (const failure of failures) console.error(`FAIL ${failure}`)
console.log(`browser: ${passed} pass, ${failures.length} fail`)
finish(failures.length === 0 ? 0 : 1)
