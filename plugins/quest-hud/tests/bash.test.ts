import { describe, expect, test } from 'claude-code/testing'

import { type BashKind, commandKinds, commitLoot, endFights, fightKinds, fightOutcome, fightScore, fightText, NO_FOES, lootText, SCORE_TAIL, startFights, stdoutOf } from '../src/bash'

// Each command as Claude might run it, and the kinds it holds, in order.
const COMMANDS: ReadonlyArray<readonly [string, readonly BashKind[]]> = [
  // Tests: package scripts and runners.
  ['npm test', ['test']],
  ['npm t', ['test']],
  ['npm run test:unit -- --watch=false', ['test']],
  ['yarn test', ['test']],
  ['pnpm test', ['test']],
  ['pnpm run test', ['test']],
  ['bun test', ['test']],
  ['bun run test', ['test']],
  ['deno test -A', ['test']],
  ['npx jest src/a.test.ts', ['test']],
  ['npx vitest run', ['test']],
  ['./node_modules/.bin/mocha', ['test']],
  ['pytest -q tests/', ['test']],
  ['python -m pytest -x', ['test']],
  ['python3 -m unittest discover', ['test']],
  ['uv run pytest', ['test']],
  ['poetry run pytest', ['test']],
  ['go test ./...', ['test']],
  ['cargo test --workspace', ['test']],
  ['dotnet test', ['test']],
  ['./gradlew test', ['test']],
  ['mvn -q test', ['test']],
  ['ctest --output-on-failure', ['test']],
  ['vendor/bin/phpunit --filter Export', ['test']],
  ['php artisan test', ['test']],
  ['bundle exec rspec spec/models', ['test']],
  ['mix test', ['test']],
  ['bats tests/', ['test']],
  ['claude plugin test plugins/quest-hud', ['test']],
  // Wrappers and compound commands.
  ['cd /repo && npm test', ['test']],
  ['cd /repo; CI=1 npm test 2>&1 | tail -20', ['test']],
  ['timeout 300 pytest', ['test']],
  ['>/tmp/out.log 2>&1 pytest -q', ['test']],
  ['timeout -s KILL 5m go test ./...', ['test']],
  ['time cargo test', ['test']],
  ['env NODE_ENV=test npx jest', ['test']],
  ['docker compose exec -T app vendor/bin/phpunit', ['test']],
  ['docker-compose exec app php artisan test', ['test']],
  ['docker exec -it web pytest', ['test']],
  ['(cd plugins/x && bun test)', ['test']],
  ['npm test && npm run lint', ['test', 'lint']],
  // Linters and type checks.
  ['npx eslint src/', ['lint']],
  ['npx prettier --check .', ['lint']],
  ['npx @biomejs/biome check .', ['lint']],
  ['biome lint src', ['lint']],
  ['stylelint "**/*.css"', ['lint']],
  ['ruff check .', ['lint']],
  ['flake8 app', ['lint']],
  ['pylint app', ['lint']],
  ['mypy app', ['lint']],
  ['python -m mypy app', ['lint']],
  ['npx tsc --noEmit', ['lint']],
  ['npx -y -p typescript@5.6.3 tsc -p plugins/quest-hud', ['lint']],
  ['golangci-lint run', ['lint']],
  ['cargo clippy -- -D warnings', ['lint']],
  ['bundle exec rubocop', ['lint']],
  ['vendor/bin/phpcs --standard=moodle .', ['lint']],
  ['vendor/bin/phpstan analyse', ['lint']],
  ['shellcheck --severity=warning scripts/*.sh', ['lint']],
  ['npm run lint', ['lint']],
  ['yarn lint', ['lint']],
  ['pnpm lint:fix', ['lint']],
  ['npm run typecheck', ['lint']],
  ['claude plugin validate . && claude plugin validate plugins/quest-hud', ['lint']],
  // Commits, gh and glab.
  ['git commit -m "Add the parser"', ['commit']],
  ['git add a.ts && git commit -q -F - <<\'EOF\'\nFix: the probe\n\nnpm test\nEOF', ['commit']],
  ['git -C /repo commit --amend --no-edit', ['commit']],
  ['gh pr create --title "x" --body-file b.md', ['gh']],
  ['gh pr merge 3 --merge', ['gh']],
  ['gh pr view --json number', ['gh']],
  ['gh run list', ['gh']],
  ['glab mr create --fill', ['glab']],
  ['glab ci status', ['glab']],
  // Not a kind: a mention is not a run.
  ['echo "npm test"', []],
  ['printf "%s" pytest', []],
  ['grep -rn pytest .', []],
  ['cat tests/x.test.ts', []],
  ['git commit --dry-run', []],
  ['git status && git log --oneline -3', []],
  ['ls node_modules/.bin/jest', []],
  ['cat > notes.md <<EOF\nnpm test\ngit commit -m x\nEOF', []],
  ['npx tsc', []],
  ['tsc --build', []],
  ['prettier --write .', []],
  ['ruff format .', []],
  ['npm install', []],
  ['npm run build', []],
  ['cd tests', []],
  ['', []],
]

describe('commandKinds', () => {
  for (const [command, kinds] of COMMANDS) {
    test(`${JSON.stringify(command)} → ${kinds.join(', ') || 'nothing'}`, () => {
      expect(commandKinds(command)).toEqual([...kinds])
    })
  }

  test('a kind run twice in one command is listed once', () => {
    expect(commandKinds('npm test; npm test')).toEqual(['test'])
  })
})

describe('fightScore', () => {
  test('bun and claude plugin test: pass and fail lines', () => {
    expect(fightScore('…\n 232 pass\n 0 fail\nRan 232 tests across 16 files.')).toEqual({ text: '232 pass · 0 fail', isLost: false })
    expect(fightScore(' 231 pass\n 1 fail\n')).toEqual({ text: '231 pass · 1 fail', isLost: true })
  })

  test('Jest and Vitest', () => {
    expect(fightScore('Tests:       2 failed, 30 passed, 32 total')).toEqual({ text: '30 pass · 2 fail', isLost: true })
    expect(fightScore('Tests:       30 passed, 30 total')).toEqual({ text: '30 pass · 0 fail', isLost: false })
    expect(fightScore(' Tests  2 failed | 30 passed (32)')).toEqual({ text: '30 pass · 2 fail', isLost: true })
  })

  test('pytest and cargo', () => {
    expect(fightScore('===== 3 failed, 40 passed in 1.20s =====')).toEqual({ text: '40 pass · 3 fail', isLost: true })
    expect(fightScore('===== 40 passed in 0.52s =====')).toEqual({ text: '40 pass · 0 fail', isLost: false })
    expect(fightScore('test result: ok. 12 passed; 0 failed; 0 ignored')).toEqual({ text: '12 pass · 0 fail', isLost: false })
  })

  test('PHPUnit and RSpec', () => {
    expect(fightScore('OK (12 tests, 30 assertions)')).toEqual({ text: '12 pass · 0 fail', isLost: false })
    expect(fightScore('FAILURES!\nTests: 12, Assertions: 30, Failures: 2, Errors: 1.')).toEqual({ text: '9 pass · 3 fail', isLost: true })
    expect(fightScore('12 examples, 2 failures')).toEqual({ text: '10 pass · 2 fail', isLost: true })
  })

  test('ESLint and tsc', () => {
    expect(fightScore('✖ 5 problems (3 errors, 2 warnings)')).toEqual({ text: '5 problems', isLost: true })
    expect(fightScore('✖ 2 problems (0 errors, 2 warnings)')).toEqual({ text: '2 problems', isLost: false })
    expect(fightScore('Found 3 errors in 2 files.')).toEqual({ text: '3 errors', isLost: true })
    expect(fightScore('Found 1 error.')).toEqual({ text: '1 error', isLost: true })
  })

  test('an output it does not know gives nothing', () => {
    expect(fightScore('')).toBe(undefined)
    expect(fightScore('all good\n')).toBe(undefined)
  })

  test('the last summary wins, and only the tail is read', () => {
    expect(fightScore(' 1 pass\n 1 fail\n…\n 2 pass\n 0 fail\n')).toEqual({ text: '2 pass · 0 fail', isLost: false })
    const early = ' 9 pass\n 9 fail\n' + 'x'.repeat(SCORE_TAIL)
    expect(fightScore(early)).toBe(undefined)
  })
})

describe('fights', () => {
  test('only test and lint runs are fights', () => {
    expect(fightKinds(['commit', 'test', 'gh', 'lint'])).toEqual(['test', 'lint'])
  })

  test('a clean exit is a win, an error a loss, and a known score decides over both', () => {
    expect(fightOutcome({ result: { stdout: 'ok', stderr: '', interrupted: false } })).toEqual({ result: 'won' })
    expect(fightOutcome({ isError: true, result: 'Exit code 1', text: 'Exit code 1\nboom' })).toEqual({ result: 'lost' })
    // A pipe into grep exits 0 whatever the tests did; the summary tells.
    expect(fightOutcome({ result: { stdout: ' 231 pass\n 1 fail\n', stderr: '', interrupted: false } }))
      .toEqual({ result: 'lost', score: { text: '231 pass · 1 fail', isLost: true } })
    // grep found nothing and exited 1, yet the tests passed.
    expect(fightOutcome({ isError: true, text: 'Exit code 1\n 232 pass\n 0 fail' }))
      .toEqual({ result: 'won', score: { text: '232 pass · 0 fail', isLost: false } })
  })

  test('interrupted, refused or backgrounded runs have no outcome', () => {
    expect(fightOutcome({ result: { stdout: '', stderr: '', interrupted: true } })).toEqual({ result: 'none' })
    expect(fightOutcome({ result: { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' } })).toEqual({ result: 'none' })
    expect(fightOutcome({ isError: true, text: 'Command interrupted by the user' })).toEqual({ result: 'none' })
    expect(fightOutcome({ deny: 'no' })).toEqual({ result: 'none' })
  })

  test('a win clears the monster, a loss leaves it standing, no outcome puts back what was there', () => {
    const fighting = startFights(NO_FOES, ['test'])
    expect(fighting).toEqual({ test: 'fighting', lint: 'none' })
    expect(endFights(fighting, ['test'], { result: 'won' }, NO_FOES)).toEqual(NO_FOES)
    expect(endFights(fighting, ['test'], { result: 'lost' }, NO_FOES)).toEqual({ test: 'standing', lint: 'none' })
    const standing = { test: 'standing', lint: 'none' } as const
    expect(endFights(startFights(standing, ['test']), ['test'], { result: 'none' }, standing)).toEqual(standing)
    expect(endFights(startFights(standing, ['lint']), ['lint'], { result: 'won' }, standing)).toEqual(standing)
  })

  test('the log line: kinds, result, score, and who fought', () => {
    const score = { text: '232 pass · 0 fail', isLost: false }
    expect(fightText(['test'], { result: 'won', score })).toBe('tests won · 232 pass · 0 fail')
    expect(fightText(['test', 'lint'], { result: 'lost' })).toBe('tests + lint lost')
    expect(fightText(['lint'], { result: 'won' }, 'gku:runner')).toBe('gku:runner · lint won')
  })
})

describe('loot', () => {
  test('git commit\'s first line gives the short sha and the subject', () => {
    expect(commitLoot('[main 2af33ea] Fix the probe\n 1 file changed, 2 insertions(+)')).toEqual({ sha: '2af33ea', subject: 'Fix the probe' })
    expect(commitLoot('[main (root-commit) 1a2b3c4] Init')).toEqual({ sha: '1a2b3c4', subject: 'Init' })
    expect(commitLoot('[feature/phase-4 a444818] Add the parser')).toEqual({ sha: 'a444818', subject: 'Add the parser' })
    expect(commitLoot('')).toEqual({})
    expect(commitLoot('nothing to commit, working tree clean')).toEqual({})
  })

  test('the loot line, and a quiet commit\'s', () => {
    expect(lootText('[main 2af33ea] Fix the probe\n')).toBe('2af33ea Fix the probe')
    expect(lootText('')).toBe('a commit')
  })

  test('stdoutOf reads a Bash result, and nothing else', () => {
    expect(stdoutOf({ stdout: 'x', stderr: '' })).toBe('x')
    expect(stdoutOf('Exit code 1')).toBe('')
    expect(stdoutOf(undefined)).toBe('')
  })
})
