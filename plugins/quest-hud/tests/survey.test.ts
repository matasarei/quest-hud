import { describe, expect, test } from 'claude-code/testing'

import { asSurvey, changedFiles, isScratchPath, mergeSurvey, parseHistory, surveyReader, SURVEY_PATTERN, talliesOf, usageFrom, type Surveyed, type Tally } from '../src/survey'

const SESSION = '/home/a/.claude/projects/-home-a-repo/aaaa-1.jsonl'
const OTHER = '/home/a/.claude/projects/-home-a-repo/bbbb-2.jsonl'

/** One line as grep -HoE prints it. */
const line = (file: string, id: string, name: string, input = ''): string =>
  `${file}:"type":"tool_use","id":"${id}","name":"${name}"${input}\n`

const command = (text: string): string => `,"input":{"command":"${text}`

const tallyOf = (...lines: string[]): Record<string, Tally> => {
  const reader = surveyReader()
  for (const text of lines) reader.feed(text)
  return reader.end()
}

describe('the survey reader', () => {
  test('counts tools per session file, under its name without the path', () => {
    const tallies = tallyOf(line(SESSION, 'a', 'Read'), line(SESSION, 'b', 'Read'), line(OTHER, 'c', 'Agent'))
    expect(Object.keys(tallies).sort()).toEqual(['aaaa-1', 'bbbb-2'])
    expect(tallies['aaaa-1']?.calls.Read).toBe(2)
    expect(tallies['bbbb-2']?.calls.Agent).toBe(1)
  })

  test('a line split across pieces is one line, and an unfinished last line still counts', () => {
    const whole = line(SESSION, 'a', 'Read') + line(SESSION, 'b', 'Write', ',"input":{"file_path":"/r/x.php')
    const reader = surveyReader()
    for (const piece of [whole.slice(0, 20), whole.slice(20, 70), whole.slice(70, -1)]) reader.feed(piece)
    const tallies = reader.end()
    expect(tallies['aaaa-1']?.calls).toEqual({ Read: 1, Write: 1 })
    expect(tallies['aaaa-1']?.extensions).toEqual({ php: 1 })
  })

  test('the same call seen twice in one file counts once: api-request lines repeat them', () => {
    expect(tallyOf(line(SESSION, 'a', 'Read'), line(SESSION, 'a', 'Read'))['aaaa-1']?.calls.Read).toBe(1)
  })

  test('the same id in two files counts in each', () => {
    const tallies = tallyOf(line(SESSION, 'a', 'Read'), line(OTHER, 'a', 'Read'))
    expect(tallies['aaaa-1']?.calls.Read).toBe(1)
    expect(tallies['bbbb-2']?.calls.Read).toBe(1)
  })

  test('a path holding a colon stays a path', () => {
    expect(Object.keys(tallyOf(line('/c:/x:y/cccc-3.jsonl', 'a', 'Read')))).toEqual(['cccc-3'])
  })

  test('both shapes of an Edit give the extension, in lower case', () => {
    const tallies = tallyOf(
      line(SESSION, 'a', 'Edit', ',"input":{"file_path":"/r/A.TS'),
      line(SESSION, 'b', 'Edit', ',"input":{"replace_all":false,"file_path":"/r/b.ts'),
      line(SESSION, 'c', 'Write', ',"input":{"file_path":"/r/noextension'),
      line(SESSION, 'd', 'Read', ',"input":{"file_path":"/r/read.php'),
    )
    expect(tallies['aaaa-1']?.extensions).toEqual({ ts: 2 })
  })

  test('a Skill call keeps its name; an odd one is dropped', () => {
    const tallies = tallyOf(
      line(SESSION, 'a', 'Skill', ',"input":{"skill":"gku:plan'),
      line(SESSION, 'b', 'Skill', ',"input":{"skill":"not a name; rm -rf'),
    )
    expect(tallies['aaaa-1']?.skills).toEqual({ 'gku:plan': 1 })
  })

  test('an MCP call counts under its server, its tool dropped', () => {
    const tallies = tallyOf(line(SESSION, 'a', 'mcp__claude-in-chrome__computer'), line(SESSION, 'b', 'mcp__claude-in-chrome__navigate'))
    expect(tallies['aaaa-1']?.mcp).toEqual({ 'claude-in-chrome': 2 })
    expect(tallies['aaaa-1']?.calls).toEqual({})
  })

  // Bash text reaches commandKinds with its JSON escapes undone: the table is what
  // that gives, a command cut at its first escaped quote included.
  const KINDS: ReadonlyArray<readonly [string, string, readonly string[]]> = [
    ['a test run', 'npx vitest run', ['test']],
    ['a linter', 'npx eslint src', ['lint']],
    ['a commit, cut at its quoted message', 'git commit -m \\', ['commit']],
    ['after a newline', 'cd x\\nnpx vitest run', ['test']],
    ['a mention in echo, cut at its quote', 'echo \\', []],
    ['a heredoc is data', 'cat <<EOF\\npytest\\nEOF', []],
    ['a PR', 'gh pr list', ['gh']],
    ['nothing known', 'ls -la', []],
  ]
  for (const [what, text, kinds] of KINDS) {
    test(`Bash: ${what}`, () => {
      const counted = tallyOf(line(SESSION, 'a', 'Bash', command(text)))['aaaa-1']?.kinds ?? {}
      expect(Object.keys(counted).sort()).toEqual([...kinds].sort())
    })
  }

  test('keeps no command, prompt, path or project: only names and counts', () => {
    const tallies = tallyOf(
      line('/home/a/projects/-home-a-MARKERPROJECT/aaaa-1.jsonl', 'a', 'Bash', command('MARKERCOMMAND=1 gh pr view MARKERARG')),
      line('/home/a/projects/-home-a-MARKERPROJECT/aaaa-1.jsonl', 'b', 'Edit', ',"input":{"file_path":"/MARKERPATH/x.php'),
    )
    expect(JSON.stringify(tallies)).not.toContain('MARKER')
    expect(tallies['aaaa-1']?.kinds.gh).toBe(1)
  })

  test('what no tool_use line is, is passed over', () => {
    expect(tallyOf('garbage\n', 'x:"type":"text"\n')).toEqual({})
  })

  test('the pattern stays inside the input, so no output or prompt can be in the stream', () => {
    expect(SURVEY_PATTERN).toContain('"type":"tool_use"')
    expect(SURVEY_PATTERN).toContain('[^"]{0,240}')
  })
})

describe('the prompt history', () => {
  const entry = (display: string, project: string, sessionId?: string): string =>
    JSON.stringify({ display, project, sessionId, timestamp: 1, pastedContents: {} })

  test('keeps the projects, with prompts counted, and the first /word of each session', () => {
    const history = parseHistory([
      entry('/gku:plan add MARKERPROMPT', '/r/a', 's1'),
      entry('/gku:plan again', '/r/a', 's1'),
      entry('fix the MARKERPROMPT please /gku:fix', '/r/b', 's2'),
      entry('/clear', '/r/a', 's2'),
    ].join('\n'))
    expect(history.projects).toEqual({ '/r/a': 3, '/r/b': 1 })
    expect(history.typed).toEqual({ s1: { 'gku:plan': 2 }, s2: { clear: 1 } })
    expect(history.sessions.sort()).toEqual(['s1', 's2'])
    expect(JSON.stringify(history)).not.toContain('MARKER')
  })

  test('a broken line, the cut first line of a tail, or empty text is passed over', () => {
    const history = parseHistory(['{"display":"/cut', 'not json', '', entry('hello', '/r/a', 's1')].join('\n'))
    expect(history.projects).toEqual({ '/r/a': 1 })
    expect(history.typed).toEqual({})
    expect(parseHistory('').sessions).toEqual([])
  })

  test('an entry with no session still names its project', () => {
    expect(parseHistory(entry('/gku:plan', '/r/a')).projects).toEqual({ '/r/a': 1 })
    expect(parseHistory(entry('/gku:plan', '/r/a')).typed).toEqual({})
  })
})

describe('scratch paths', () => {
  const ROWS: ReadonlyArray<readonly [string, boolean]> = [
    ['/private/tmp/claude-501/x', true],
    ['/tmp/hud-smoke', true],
    ['/var/folders/ab/T/x', true],
    ['C:\\Users\\a\\AppData\\Local\\Temp\\x', true],
    ['/Users/a/Projects/quest-hud', false],
    ['/home/a/tmpfiles', false],
  ]
  for (const [path, isScratch] of ROWS) {
    test(path, () => expect(isScratchPath(path)).toBe(isScratch))
  }
})

describe('which transcripts to read again', () => {
  const file = (name: string, size: number, mtimeMs: number) => ({ name, path: `/p/${name}.jsonl`, size, mtimeMs })
  const tally: Tally = { calls: {}, mcp: {}, skills: {}, extensions: {}, kinds: {} }

  test('a new file, a grown file and a touched file; not one unchanged', () => {
    const cached = { same: { size: 1, mtimeMs: 1, tally }, grown: { size: 1, mtimeMs: 1, tally }, touched: { size: 1, mtimeMs: 1, tally } }
    const changed = changedFiles([file('same', 1, 1), file('grown', 2, 1), file('touched', 1, 2), file('new', 1, 1)], cached)
    expect(changed.map(f => f.name)).toEqual(['grown', 'touched', 'new'])
  })

  test('nothing cached: all of them', () => {
    expect(changedFiles([file('a', 1, 1)], {}).map(f => f.name)).toEqual(['a'])
  })
})

describe('usage over the sessions', () => {
  const tally = (over: Partial<Tally>): Tally => ({ calls: {}, mcp: {}, skills: {}, extensions: {}, kinds: {}, ...over })
  const NOW = Date.parse('2026-11-02T00:00:00Z')
  const DAY = 86_400_000
  const NO_HISTORY = { projects: {}, typed: {}, sessions: [] }

  test('adds the sessions up: editing, checked, skills, agents, tools', () => {
    const usage = usageFrom(
      {
        a: tally({ calls: { Edit: 2, Agent: 1 }, kinds: { test: 3 }, extensions: { php: 2 }, skills: { 'gku:plan': 1 } }),
        b: tally({ calls: { Write: 1, WebSearch: 2, WebFetch: 1 }, extensions: { php: 1, ts: 1 }, mcp: { 'claude-in-chrome': 4, postman: 1 } }),
        c: tally({ calls: { Read: 1 }, kinds: { lint: 2, gh: 5 } }),
      },
      NO_HISTORY,
      [],
      NOW,
      NOW - 35 * DAY,
    )
    expect(usage).toEqual({
      isRead: true,
      sessions: 3,
      days: 35,
      editingSessions: 2,
      checkedSessions: 1,
      testRuns: 3,
      lintRuns: 2,
      skillSessions: 1,
      allSessions: 3,
      skillRuns: { 'gku:plan': 1 },
      agentCalls: 1,
      agentSessions: 1,
      mcpCalls: 5,
      mcpServers: 2,
      browserCalls: 4,
      webCalls: 3,
      ghRuns: 5,
      edits: { php: 3, ts: 1 },
    })
  })

  test('typed commands count only if they are skills here, and their session joins the share', () => {
    const history = { projects: {}, typed: { a: { 'gku:plan': 2 }, s9: { 'gku:fix': 1, clear: 4, 'quest-hud:level': 3 } }, sessions: ['a', 's9', 's10'] }
    const usage = usageFrom({ a: tally({ skills: { 'gku:plan': 1 } }) }, history, ['gku:plan', 'gku:fix'], NOW, NOW)
    expect(usage.skillRuns).toEqual({ 'gku:plan': 3, 'gku:fix': 1 })
    expect(usage.skillSessions).toBe(2)
    expect(usage.allSessions).toBe(3)
    expect(usage.sessions).toBe(1)
  })

  test('no tallies: nothing was read, and history still counts its typed skills', () => {
    const history = { projects: {}, typed: { s1: { 'gku:plan': 1 } }, sessions: ['s1', 's2'] }
    const usage = usageFrom({}, history, ['gku:plan'], NOW, undefined)
    expect(usage.isRead).toBe(false)
    expect(usage.sessions).toBe(0)
    expect(usage.days).toBe(0)
    expect(usage.skillSessions).toBe(1)
    expect(usage.allSessions).toBe(2)
  })

  test('a session under a day old is one day', () => {
    expect(usageFrom({ a: tally({}) }, NO_HISTORY, [], NOW, NOW - 1000).days).toBe(1)
  })
})

describe('what a scan leaves in the cache', () => {
  const tally = (reads: number): Tally => ({ calls: { Read: reads }, mcp: {}, skills: {}, extensions: {}, kinds: {} })
  const file = (name: string, size = 1, mtimeMs = 1) => ({ name, path: `/p/${name}.jsonl`, size, mtimeMs })
  const known = (reads: number, size = 1, mtimeMs = 1): Surveyed => ({ size, mtimeMs, tally: tally(reads) })

  test('a read file takes its new tally, an unchanged one keeps its own, a swept one goes', () => {
    const merged = mergeSurvey({ same: known(1), grown: known(2), swept: known(3) }, [file('same'), file('grown', 9)], [file('grown', 9)], { grown: tally(7) })
    expect(merged).toEqual({ same: known(1), grown: known(7, 9) })
  })

  test('a file with no calls in a scan that found others is an empty session, not read again', () => {
    const merged = mergeSurvey({}, [file('a'), file('empty')], [file('a'), file('empty')], { a: tally(1) })
    expect(merged.empty?.tally.calls).toEqual({})
    expect(changedFiles([file('empty')], merged)).toEqual([])
  })

  test('a scan that found nothing at all changes nothing: the old tallies stand, swept ones aside', () => {
    const merged = mergeSurvey({ grown: known(2), swept: known(3) }, [file('grown', 9), file('new')], [file('grown', 9), file('new')], {})
    expect(merged).toEqual({ grown: known(2) })
    expect(changedFiles([file('grown', 9), file('new')], merged).map(f => f.name)).toEqual(['grown', 'new'])
  })

  test('talliesOf takes the tallies out', () => {
    expect(talliesOf({ a: known(4) })).toEqual({ a: tally(4) })
  })
})

describe('a survey from the store', () => {
  const good = { size: 1, mtimeMs: 1, tally: { calls: {}, mcp: {}, skills: {}, extensions: {}, kinds: {} } }

  test('comes back as it went in', () => {
    expect(asSurvey({ a: good })).toEqual({ a: good })
  })

  test('what is not one is nothing; a broken entry alone is dropped', () => {
    expect(asSurvey(undefined)).toEqual({})
    expect(asSurvey('x')).toEqual({})
    expect(asSurvey({ a: good, b: { size: 1 }, c: null, d: { ...good, tally: { calls: {} } } })).toEqual({ a: good })
  })
})
