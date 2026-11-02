// How /quest-hud:sync reaches GitHub: through the person's own gh, so the mod never
// holds a token. It holds no state and draws nothing; src/github.ts reads what comes back.
import type { EngineInterface, ProcessRunResult } from 'claude-code'

import { repoOfRemote } from '../src/github'

/** gh answers without asking anything, in plain text. */
const GH_ENV: Readonly<Record<string, string>> = { GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' }

/** How long the sweep may take: about 10 s over 51 repositories. */
export const SWEEP_MS = 60_000

/** What gh answered, any exit code; undefined when it would not start or ran out of time. */
export async function runGh($: EngineInterface, argv: readonly string[], timeoutMs?: number): Promise<ProcessRunResult | undefined> {
  return $.process.run(argv, { env: { ...GH_ENV }, ...(timeoutMs === undefined ? {} : { timeoutMs }) }).catch(() => undefined)
}

/** The repository the session is in, if it is on GitHub. Used to sort, and never kept. */
export async function readHereRepo($: EngineInterface): Promise<string | undefined> {
  const remote = await $.process.run(['git', 'remote', 'get-url', 'origin']).catch(() => undefined)

  return remote?.exitCode === 0 ? repoOfRemote(remote.stdout) : undefined
}
