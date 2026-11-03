// The page: draws the mod's band from a fixed session.
import { $, show } from './engine'
import { drawBand } from '../../plugins/quest-hud/hooks/band'
import { bandModel } from '../../plugins/quest-hud/src/meters'
import type { RenderInput } from 'claude-code'

const root = document.documentElement

addEventListener('error', event => {
  root.dataset.error = event.message
})

const now = Date.now()
const band = bandModel(
  { title: 'gku:implement', skill: 'gku:implement', zone: 'forge', startedAt: 0 },
  [],
  { window: 200_000, contextPercent: 41, contextTokens: 82_000, weekUsed: 38, weekResetsAt: new Date(now + 2 * 86_400_000).toISOString() },
  'hpmp',
  now,
)
const slot = document.getElementById('band')
if (slot) show(slot, drawBand($, {} as RenderInput<'AbovePrompt'>, band, 'raster', 'stand', 'wizard'))
root.dataset.ready = 'yes'
