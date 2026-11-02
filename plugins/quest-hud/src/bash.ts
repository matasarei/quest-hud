// What a Bash call was, from its command and its output: a test run, a lint
// or type check, a commit, a gh or glab call. Pure. It recognises known shapes
// only, and nothing here is ever drawn as it was typed: callers draw the kind,
// a score, a commit subject or a PR number.
import type { FightKind, Foe, Foes } from '../types'
import { cleanTitle } from './quest'

export type BashKind = 'test' | 'lint' | 'commit' | 'gh' | 'glab'

/** How much of a command's output the scores read: the summary is at its end. */
export const SCORE_TAIL = 4096

/** A command's text without the bodies of its heredocs, which are data, not commands. */
const dropHeredocs = (command: string): string => {
  const kept: string[] = []
  let end: string | undefined

  for (const line of command.split('\n')) {
    if (end !== undefined) {
      if (line.trim() === end) end = undefined
      continue
    }
    kept.push(line)
    const start = /(?:^|[^<])<<-?\s*(['"]?)([A-Za-z_]\w*)\1/.exec(line)
    if (start) end = start[2]
  }

  return kept.join('\n')
}

/**
 * The simple commands in a command line, each as its words with quotes
 * removed: split on `&&`, `||`, `;`, `|`, `&`, newlines, parentheses and
 * command substitutions; redirections and comments dropped.
 */
export const commandWords = (command: string): string[][] => {
  const text = dropHeredocs(command)
  const segments: string[][] = []
  let segment: string[] = []
  let word = ''
  let inWord = false
  let isRedirectTarget = false

  const endWord = (): void => {
    if (inWord && !isRedirectTarget) segment.push(word)
    if (inWord) isRedirectTarget = false
    word = ''
    inWord = false
  }
  const endSegment = (): void => {
    endWord()
    isRedirectTarget = false
    if (segment.length > 0) segments.push(segment)
    segment = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    const next = text[i + 1]

    if (c === '\\') {
      if (next !== undefined && next !== '\n') word += next
      inWord = true
      i++
    } else if (c === "'") {
      const close = text.indexOf("'", i + 1)
      const stop = close < 0 ? text.length : close
      word += text.slice(i + 1, stop)
      inWord = true
      i = stop
    } else if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < text.length) j++
        word += text[j]
        j++
      }
      inWord = true
      i = j
    } else if (c === ' ' || c === '\t') {
      endWord()
    } else if (c === '#' && !inWord) {
      while (i + 1 < text.length && text[i + 1] !== '\n') i++
    } else if (c === '<' || c === '>' || (c === '&' && next === '>')) {
      // A redirection: a file descriptor before it is part of it, and so is
      // `&1` after it; otherwise the next word is its target.
      if (/^\d+$/.test(word)) {
        word = ''
        inWord = false
      }
      endWord()
      while (text[i + 1] === '<' || text[i + 1] === '>' || (c === '&' && text[i + 1] === '>')) i++
      if (text[i + 1] === '&' && /[\d-]/.test(text[i + 2] ?? '')) {
        i += 2
        while (/\d/.test(text[i + 1] ?? '')) i++
      } else {
        isRedirectTarget = true
      }
    } else if (c === '$' && next === '(') {
      endSegment()
      i++
    } else if (c === '\n' || c === ';' || c === '(' || c === ')' || c === '`' || c === '|' || c === '&') {
      endSegment()
      if ((c === '|' || c === '&') && next === c) i++
    } else {
      word += c
      inWord = true
    }
  }

  endSegment()
  return segments
}

/** A path's last segment: `vendor/bin/phpunit` → `phpunit`. */
const base = (word: string): string => word.slice(word.lastIndexOf('/') + 1)

const isAssignment = (word: string): boolean => /^[A-Za-z_]\w*=/.test(word)

/** Drops flags from the front; those in `withValue` take the next word too. */
const skipFlags = (words: readonly string[], withValue: readonly string[] = []): string[] => {
  let i = 0
  while (i < words.length && (words[i] as string).startsWith('-')) {
    i += withValue.includes(words[i] as string) ? 2 : 1
  }
  return words.slice(i)
}

const DOCKER_VALUE_FLAGS = ['-e', '--env', '-w', '--workdir', '-u', '--user', '--name', '-v', '--volume', '--env-file', '--entrypoint', '-p']

/**
 * The words of the command that actually runs: assignments and wrappers such
 * as `timeout 300`, `npx -y`, `uv run`, `bundle exec` and `docker compose
 * exec app` taken off the front.
 */
const unwrap = (words: readonly string[]): string[] => {
  let rest = [...words]

  for (let guard = 0; guard < 16 && rest.length > 0; guard++) {
    while (rest.length > 0 && isAssignment(rest[0] as string)) rest.shift()
    const [first = '', second = ''] = rest
    const name = base(first)

    if (name === 'time' || name === 'nohup' || name === 'command' || name === 'exec') {
      rest = skipFlags(rest.slice(1))
    } else if (name === 'sudo') {
      rest = skipFlags(rest.slice(1), ['-u', '-g'])
    } else if (name === 'nice') {
      rest = skipFlags(rest.slice(1), ['-n'])
    } else if (name === 'env') {
      rest = skipFlags(rest.slice(1), ['-u'])
    } else if (name === 'timeout') {
      rest = skipFlags(rest.slice(1), ['-s', '-k', '--signal', '--kill-after']).slice(1)
    } else if (name === 'npx' || name === 'bunx') {
      rest = skipFlags(rest.slice(1), ['-p', '--package'])
    } else if (name === 'pnpm' && (second === 'exec' || second === 'dlx')) {
      rest = skipFlags(rest.slice(2))
    } else if (['uv', 'poetry', 'pipenv', 'pdm', 'hatch', 'rye'].includes(name) && second === 'run') {
      rest = skipFlags(rest.slice(2), ['--with', '--python'])
    } else if (name === 'bundle' && second === 'exec') {
      rest = rest.slice(2)
    } else if ((name === 'docker' && second === 'compose') || name === 'docker-compose') {
      const verb = name === 'docker' ? rest[2] : second
      if (verb !== 'exec' && verb !== 'run') break
      rest = skipFlags(rest.slice(name === 'docker' ? 3 : 2), DOCKER_VALUE_FLAGS).slice(1)
    } else if (name === 'docker' && (second === 'exec' || second === 'run')) {
      rest = skipFlags(rest.slice(2), DOCKER_VALUE_FLAGS).slice(1)
    } else {
      break
    }
  }

  return rest
}

/** A package script's kind, by its name: `test:unit` is a test, `lint:fix` and `typecheck` a lint. */
const scriptKind = (script: string | undefined): BashKind | undefined => {
  if (script === undefined) return undefined
  if (/^tests?(?:$|[:_-])/.test(script)) return 'test'
  if (/^(?:lint|typecheck|type-check|check-types)(?:$|[:_-])/.test(script)) return 'lint'
  return undefined
}

const TEST_RUNNERS = new Set(['jest', 'vitest', 'mocha', 'pytest', 'phpunit', 'pest', 'rspec', 'bats', 'ctest', 'ava'])
const LINTERS = new Set([
  'eslint', 'stylelint', 'flake8', 'pylint', 'mypy', 'golangci-lint', 'rubocop', 'phpcs', 'phpstan', 'psalm',
  'shellcheck', 'markdownlint', 'hadolint', 'actionlint', 'yamllint',
])

/** The kind of one simple command, its wrappers already taken off. */
const kindOf = (words: readonly string[]): BashKind | undefined => {
  const [first = '', ...args] = words
  const name = base(first)
  const [a0, a1] = args

  if (TEST_RUNNERS.has(name)) return 'test'
  if (LINTERS.has(name)) return 'lint'

  switch (name) {
    case 'npm':
      if (a0 === 'test' || a0 === 't') return 'test'
      return a0 === 'run' || a0 === 'run-script' ? scriptKind(a1) : undefined
    case 'yarn':
    case 'pnpm':
    case 'bun':
      if (a0 === 'run') return scriptKind(a1)
      if (name === 'bun' && a0 === 'test') return 'test'
      return scriptKind(a0) ?? (name === 'bun' ? undefined : kindOf(args))
    case 'deno':
      return a0 === 'test' ? 'test' : a0 === 'lint' ? 'lint' : undefined
    case 'python':
    case 'python3':
    case 'py':
      if (a0 !== '-m' || a1 === undefined) return undefined
      if (a1 === 'pytest' || a1 === 'unittest') return 'test'
      return a1 === 'mypy' || a1 === 'flake8' || a1 === 'pylint' || (a1 === 'ruff' && args[2] === 'check') ? 'lint' : undefined
    case 'go':
    case 'dotnet':
    case 'mix':
      return a0 === 'test' ? 'test' : undefined
    case 'cargo':
      return a0 === 'test' || a0 === 'nextest' ? 'test' : a0 === 'clippy' ? 'lint' : undefined
    case 'gradle':
    case 'gradlew':
    case 'mvn':
    case 'mvnw':
      return args.includes('test') ? 'test' : undefined
    case 'php':
      return (a0 === 'artisan' && a1 === 'test') || (a0 !== undefined && base(a0) === 'phpunit') ? 'test' : undefined
    case 'claude':
      return a0 === 'plugin' && a1 === 'test' ? 'test' : a0 === 'plugin' && a1 === 'validate' ? 'lint' : undefined
    case 'prettier':
      return args.includes('--check') || args.includes('-c') ? 'lint' : undefined
    case 'biome':
      return a0 === 'check' || a0 === 'lint' || a0 === 'ci' ? 'lint' : undefined
    case 'ruff':
      return a0 === 'check' ? 'lint' : undefined
    case 'tsc':
      return args.some(arg => arg === '--noEmit' || arg === '-p' || arg === '--project' || arg.startsWith('--project=')) ? 'lint' : undefined
    case 'git': {
      const sub = skipFlags(args, ['-C', '-c', '--git-dir', '--work-tree'])
      return sub[0] === 'commit' && !sub.includes('--dry-run') ? 'commit' : undefined
    }
    case 'gh':
      return 'gh'
    case 'glab':
      return 'glab'
    default:
      return undefined
  }
}

/**
 * What `git commit` printed about the commit it made: `[main 2af33ea] Fix the
 * probe` gives the short sha and the subject. A quiet commit prints nothing.
 */
export const commitLoot = (stdout: string): { sha?: string; subject?: string } => {
  const made = /^\[[^\]\s]+(?: \([^)]*\))? ([0-9a-f]{7,40})\] (.*)$/m.exec(stdout)
  return made ? { sha: made[1] as string, subject: made[2] as string } : {}
}

/** A Bash result's standard output, or nothing when it has none. */
export const stdoutOf = (result: unknown): string =>
  typeof result === 'object' && result !== null && typeof (result as { stdout?: unknown }).stdout === 'string' ? (result as { stdout: string }).stdout : ''

/** The loot line: `2af33ea Fix the probe`, or `a commit` when git said nothing. */
export const lootText = (stdout: string): string => {
  const { sha, subject } = commitLoot(stdout)
  return sha === undefined ? 'a commit' : cleanTitle(`${sha} ${subject ?? ''}`)
}

/** A PR or MR number from an argument: `3`, or a URL ending in one. */
const changeNumber = (word: string | undefined): string | undefined =>
  word === undefined ? undefined : /^\d+$/.test(word) ? word : /\/(?:pull|merge_requests)\/(\d+)/.exec(word)?.[1]

/**
 * The log line for a gh or glab call that changed a pull or merge request:
 * opened, merged, ready, closed, and checks passed or failed. Undefined for
 * every other call, and for a failed one but the checks.
 */
export const forgeEvent = (kind: 'gh' | 'glab', command: string, ok: boolean, stdout: string): string | undefined => {
  const words = commandWords(command).map(unwrap).find(found => kindOf(found) === kind)
  if (words === undefined) return undefined

  const [, noun, verb, ...rest] = words
  if (noun !== (kind === 'gh' ? 'pr' : 'mr')) return undefined

  const number = verb === 'create' ? changeNumber(/\S*\/(?:pull|merge_requests)\/\d+/.exec(stdout)?.[0]) : changeNumber(rest.find(word => !word.startsWith('-')))
  const name = kind === 'gh' ? (number ? `PR #${number}` : 'PR') : number ? `MR !${number}` : 'MR'

  if (verb === 'checks') return `${name} checks ${ok ? 'passed' : 'failed'}`
  if (!ok) return undefined
  const done: Readonly<Record<string, string>> = { create: 'opened', merge: 'merged', ready: 'ready', close: 'closed' }
  return verb !== undefined && done[verb] !== undefined ? `${name} ${done[verb]}` : undefined
}

/** The kinds a command line holds, each once, in the order they first appear. */
export const commandKinds = (command: string): BashKind[] => {
  const kinds: BashKind[] = []
  for (const words of commandWords(command)) {
    const kind = kindOf(unwrap(words))
    if (kind !== undefined && !kinds.includes(kind)) kinds.push(kind)
  }
  return kinds
}

export type Score = { text: string; isLost: boolean }

type Found = { at: number; score: Score }

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

const tally = (passed: number, failed: number): Score => ({ text: `${passed} pass · ${failed} fail`, isLost: failed > 0 })

/** Every match of `pattern` in `text`, as a score at the index it starts. */
const each = (text: string, pattern: RegExp, score: (match: RegExpMatchArray) => Score | undefined): Found[] =>
  [...text.matchAll(pattern)].flatMap(match => {
    const found = score(match)
    return found === undefined ? [] : [{ at: match.index ?? 0, score: found }]
  })

const count = (line: string, pattern: RegExp): number => Number(pattern.exec(line)?.[1] ?? 0)

/**
 * The score in a test or lint run's output: its last summary line that this
 * knows, read from the last SCORE_TAIL characters. Undefined when there is none.
 */
export const fightScore = (output: string): Score | undefined => {
  const tail = output.slice(-SCORE_TAIL)
  const found: Found[] = [
    // bun, claude plugin test: ` 232 pass` then ` 0 fail`.
    ...each(tail, /^[ \t]*(\d+) pass[ \t]*\n[ \t]*(\d+) fail[ \t]*$/gm, m => tally(Number(m[1]), Number(m[2]))),
    // PHPUnit.
    ...each(tail, /OK \((\d+) tests?,/g, m => tally(Number(m[1]), 0)),
    ...each(tail, /^Tests: (\d+), Assertions: .*$/gm, m => {
      const failed = count(m[0], /Failures: (\d+)/) + count(m[0], /Errors: (\d+)/)
      return tally(Number(m[1]) - failed, failed)
    }),
    // RSpec.
    ...each(tail, /(\d+) examples?, (\d+) failures?/g, m => tally(Number(m[1]) - Number(m[2]), Number(m[2]))),
    // ESLint.
    ...each(tail, /✖ (\d+) problems? \((\d+) errors?/g, m => ({ text: plural(Number(m[1]), 'problem', 'problems'), isLost: Number(m[2]) > 0 })),
    // tsc.
    ...each(tail, /Found (\d+) errors?/g, m => ({ text: plural(Number(m[1]), 'error', 'errors'), isLost: Number(m[1]) > 0 })),
    // Jest, Vitest, pytest, cargo: a line with `N passed` and maybe `N failed`.
    ...each(tail, /^.*\b\d+ passed\b.*$/gm, m => tally(count(m[0], /(\d+) passed/), count(m[0], /(\d+) failed/))),
  ]

  return found.reduce<Found | undefined>((last, item) => (last === undefined || item.at >= last.at ? item : last), undefined)?.score
}

/** The fights among a command's kinds. */
export const fightKinds = (kinds: readonly BashKind[]): FightKind[] =>
  kinds.filter((kind): kind is FightKind => kind === 'test' || kind === 'lint')

/** How a fight ended: won, lost, or not at all (interrupted, refused, sent to the background). */
export type Outcome = { result: 'won' | 'lost' | 'none'; score?: Score }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

/**
 * A fight's end, from what the Bash call resolved to. A score the output
 * shows decides it; without one, an error is a loss. A run interrupted,
 * refused or still running in the background has no outcome yet.
 */
export const fightOutcome = (ran: { deny?: string; isError?: boolean; result?: unknown; text?: string }): Outcome => {
  if (ran.deny !== undefined) return { result: 'none' }

  if (ran.isError === true) {
    const text = typeof ran.text === 'string' ? ran.text : typeof ran.result === 'string' ? ran.result : ''
    if (/^[^\n]*interrupted/i.test(text)) return { result: 'none' }
    const score = fightScore(text)
    return { result: score?.isLost === false ? 'won' : 'lost', ...(score ? { score } : {}) }
  }

  const result = isRecord(ran.result) ? ran.result : {}
  if (result.interrupted === true || typeof result.backgroundTaskId === 'string') return { result: 'none' }

  const output = [result.stdout, result.stderr].filter((part): part is string => typeof part === 'string').join('\n')
  const score = fightScore(output)
  return { result: score?.isLost === true ? 'lost' : 'won', ...(score ? { score } : {}) }
}

export const NO_FOES: Foes = { test: 'none', lint: 'none' }

/** The monsters once these fights start. */
export const startFights = (foes: Foes, kinds: readonly FightKind[]): Foes =>
  kinds.reduce<Foes>((next, kind) => ({ ...next, [kind]: 'fighting' }), foes)

/**
 * The monsters once these fights end: gone after a win, standing after a
 * loss, and as they were before the run when it had no outcome.
 */
export const endFights = (foes: Foes, kinds: readonly FightKind[], outcome: Outcome, before: Foes): Foes =>
  kinds.reduce<Foes>((next, kind) => {
    const foe: Foe = outcome.result === 'won' ? 'none' : outcome.result === 'lost' ? 'standing' : before[kind]
    return { ...next, [kind]: foe }
  }, foes)

/**
 * Whether a monster blocks the Road: one being fought, or one still standing
 * after a lost run. The wizard holds his ground, facing it, until a run of
 * its kind beats it, rather than walking on past it.
 */
export const holdsTheRoad = (foes: Foes): boolean => Object.values(foes).some(foe => foe !== 'none')

const FIGHT_LABEL: Readonly<Record<FightKind, string>> = { test: 'tests', lint: 'lint' }

/** `tests won · 232 pass · 0 fail`, led by the subagent that fought it when one did. */
export const fightText = (kinds: readonly FightKind[], outcome: Outcome, who?: string): string =>
  [
    ...(who === undefined ? [] : [who]),
    `${kinds.map(kind => FIGHT_LABEL[kind]).join(' + ')} ${outcome.result}`,
    ...(outcome.score ? [outcome.score.text] : []),
  ].join(' · ')
