// What /quest-hud:level and /quest-hud:level-up answer. Pure. The catalogue is a
// fixed list in this file, never fetched: a registry's names are not trusted input,
// and a skill runs with the person's permissions. Commands are printed, never run.
import type { LevelCard, Usage } from '../types'
import { cardOf, mainLanguage, pointsToNext, thousands, type Inventory } from './harness'
import { cleanTitle } from './quest'

/** When the catalogue's names and commands were last checked against their sources. */
export const CATALOGUE_CHECKED = '2026-11-02'

/** How many quests /quest-hud:level-up lists. */
export const MAX_QUESTS = 5

export type LevelQuest = { title: string; tag: string; why: string; act: readonly string[] }

const plural = (count: number, one: string): string => `${thousands(count)} ${one}${count === 1 ? '' : 's'}`

const official = (plugin: string): string => `/plugin install ${plugin}@claude-plugins-official`

const LONG_EDITS = 10
const MANY_PR_RUNS = 20
const MANY_WEB_CALLS = 20
const MANY_FRONT_EDITS = 20
/** A skill run fewer times than this has not been tried much. */
const TRIED_RUNS = 3
const MAX_NAMED_SKILLS = 3

const FRONT_END: readonly string[] = ['tsx', 'jsx', 'vue', 'svelte', 'css', 'scss', 'html']

type Facts = { inventory: Inventory; usage: Usage; scores: Readonly<Record<string, number | undefined>> }

const hasPack = ({ inventory: { plugins, skills } }: Facts, name: string): boolean =>
  plugins.includes(name) || skills.some(skill => skill.startsWith(`${name}:`))

/** A row of the catalogue: which part it raises, or a side quest; `quest` answers undefined when it does not apply. */
type Row = { part: string; isSide?: boolean; tag?: string; quest: (facts: Facts) => { title: string; why: string; act: readonly string[] } | undefined }

/** The guild's quest, always among them: how to join, or what to try next. Only the command list is read. */
const guild: Row = {
  part: 'Skills',
  tag: 'Skills · house pick',
  quest: facts => {
    if (!hasPack(facts, 'gku')) {
      return {
        title: "The Guild's Skillset",
        why: 'Plan, build, review, fix and open a PR, each a skill that works from the last one. A small pack: here because it is ours, not for its stars.',
        act: ['/plugin marketplace add grinchenkoedu/claude-skills', '/plugin install gku@grinchenkoedu'],
      }
    }

    const skillRuns = facts.usage.skillRuns
    const untried = facts.inventory.skills
      .filter(skill => skill.startsWith('gku:') && (skillRuns[skill] ?? 0) < TRIED_RUNS)
      .sort((a, b) => (skillRuns[a] ?? 0) - (skillRuns[b] ?? 0))
      .slice(0, MAX_NAMED_SKILLS)
      .map(skill => `/${cleanTitle(skill)}`)

    return {
      title: "The Guild's Next Skill",
      why: untried.length > 0 ? `gku is here. Not yet tried much: ${untried.join(', ')}.` : 'gku is here, and you have walked all of it. Bring a review to each thing it builds.',
      act: [],
    }
  },
}

const CATALOGUE: readonly Row[] = [
  guild,
  {
    part: 'Instructions',
    quest: ({ inventory: { workedProjects, instructedProjects } }) => {
      const missing = workedProjects - instructedProjects
      return missing <= 0 ? undefined : {
        title: 'The Founding Stone',
        why: `${missing} of the ${workedProjects} projects you work in ${missing === 1 ? 'has' : 'have'} no CLAUDE.md or AGENTS.md: each session there starts by guessing.`,
        act: ['/init, in each of them', official('claude-md-management')],
      }
    },
  },
  {
    part: 'Memory',
    quest: ({ scores: { Memory: score } }) => (score !== undefined && score > 1 ? undefined : {
      title: 'The Long Memory',
      why: 'Auto memory keeps what one session learns for the next.',
      act: ['/memory', official('claude-md-management')],
    }),
  },
  {
    part: 'Tools',
    quest: ({ inventory: { plugins }, usage: { edits } }) => {
      const main = mainLanguage(edits)
      return main === undefined || main.edits < LONG_EDITS || plugins.includes(main.lsp) ? undefined : {
        title: 'The Silent Scribe',
        why: `${thousands(main.edits)} ${main.name} edits and no language server: errors wait for a test to find them.`,
        act: [official(main.lsp)],
      }
    },
  },
  {
    part: 'Guardrails',
    quest: ({ inventory: { hasHooks }, usage: { testRuns, lintRuns }, scores: { Checks: score } }) =>
      hasHooks || score === undefined || score < 1 ? undefined : {
        title: 'The Gatekeeper',
        why: `${plural(testRuns + lintRuns, 'test and lint run')}, each one asked for. A hook can run them after every edit.`,
        act: [official('hookify')],
      },
  },
  {
    part: 'Guardrails',
    quest: ({ inventory: { hasPermissionRules, commands } }) => (hasPermissionRules ? undefined : {
      title: 'The Swift Pass',
      why: 'No standing permission rules: what is safe here is decided again each time.',
      act: [commands.includes('fewer-permission-prompts') ? '/fewer-permission-prompts' : '/permissions'],
    }),
  },
  {
    part: 'Delegation',
    quest: ({ inventory: { plugins }, usage: { agentCalls, sessions }, scores: { Delegation: score } }) =>
      score === undefined || score > 1 ? undefined : {
        title: 'The Ghost Party',
        why: `${thousands(agentCalls)} subagent ${agentCalls === 1 ? 'call' : 'calls'} in ${thousands(sessions)} sessions. A long sweep or a second reading can go to another context, and leave this one clear.`,
        act: ['/agents', ...(plugins.includes('feature-dev') ? [] : [official('feature-dev')])],
      },
  },
  {
    part: 'Skills',
    quest: facts => (hasPack(facts, 'gku') || hasPack(facts, 'superpowers') || hasPack(facts, 'mattpocock-skills') ? undefined : {
      title: 'The Method',
      why: 'No method pack yet: one gives plans, debugging and reviews a shape. They overlap, so take one.',
      act: [official('superpowers')],
    }),
  },
  {
    part: 'Skills',
    quest: ({ inventory: { plugins, skills }, usage: { ghRuns } }) =>
      ghRuns < MANY_PR_RUNS || ['code-review', 'pr-review-toolkit', 'gku'].some(name => plugins.includes(name)) || skills.some(skill => /review/i.test(skill)) ? undefined : {
        title: 'Second Eyes',
        why: `${thousands(ghRuns)} gh runs and no review skill: nobody else reads a change before it goes up.`,
        act: [official('code-review'), official('pr-review-toolkit')],
      },
  },
  {
    part: 'Skills',
    isSide: true,
    quest: facts => (hasPack(facts, 'mattpocock-skills') || facts.inventory.skills.some(skill => /grill/.test(skill)) ? undefined : {
      title: 'The Grilling',
      why: 'Be questioned on a plan, one thing at a time, before anything is written.',
      act: [official('mattpocock-skills'), '/setup-matt-pocock-skills', '/grill-me'],
    }),
  },
  {
    part: 'Tools',
    isSide: true,
    quest: ({ inventory: { plugins }, usage: { webCalls } }) =>
      webCalls < MANY_WEB_CALLS || plugins.includes('context7') ? undefined : {
        title: 'The Library Scroll',
        why: `${thousands(webCalls)} web searches and fetches. Context7 answers from a library's docs for your version; its questions go to Upstash's hosted server.`,
        act: [official('context7')],
      },
  },
  {
    part: 'Tools',
    isSide: true,
    quest: ({ usage: { isRead, browserCalls, edits } }) => {
      const front = FRONT_END.reduce((sum, extension) => sum + (edits[extension] ?? 0), 0)
      return !isRead || browserCalls > 0 || front < MANY_FRONT_EDITS ? undefined : {
        title: 'The Looking Glass',
        why: `${thousands(front)} front-end edits and no browser used to look at them.`,
        act: [official('playwright')],
      }
    },
  },
  {
    part: 'Skills',
    isSide: true,
    quest: ({ inventory: { plugins } }) => (plugins.includes('session-report') ? undefined : {
      title: 'The Ledger',
      why: 'A report of where your tokens went: sessions, cache, subagents and skills.',
      act: [official('session-report')],
    }),
  },
]

/** The quests for this harness: the weakest part first, side quests after, the guild always among them. */
export const pickQuests = (inventory: Inventory, usage: Usage, limit: number): LevelQuest[] => {
  const card = cardOf(inventory, usage)
  const scores = Object.fromEntries(card.parts.map(part => [part.name, part.score]))
  const facts: Facts = { inventory, usage, scores }
  const scoreOf = (row: Row): number => scores[row.part] ?? Number.MAX_SAFE_INTEGER
  const rows = CATALOGUE.filter(row => !row.isSide).sort((a, b) => scoreOf(a) - scoreOf(b)).concat(CATALOGUE.filter(row => row.isSide))
  const quests = rows.flatMap(row => {
    const quest = row.quest(facts)
    if (quest === undefined) return []

    const raises = (scores[row.part] ?? 0) < 3 ? `${row.part} +1` : row.part
    return [{ row, quest: { ...quest, tag: row.isSide ? 'side quest' : row.tag ?? raises } }]
  })
  const shown = quests.slice(0, limit)

  // The list is full and the guild did not make it: it takes the last place.
  if (!shown.some(one => one.row === guild)) {
    const guilds = quests.find(one => one.row === guild)
    if (guilds !== undefined) shown[shown.length - 1] = guilds
  }

  return shown.map(one => one.quest)
}

const sizeText = (bytes: number): string =>
  bytes >= 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(1)} GB` : `${(bytes / 2 ** 20).toFixed(1)} MB`

/** What /quest-hud:level answers while the first reading is under way. */
export const scoutRidesText = (sessions: number, bytes: number): string =>
  [
    `The scout rides out: ${plural(sessions, 'session')}, ${sizeText(bytes)}, read as counts only.`,
    'The level appears beside the bars on the Road when it is back (/quest-hud:pane opens the Road). /quest-hud:level then lists the parts.',
  ].join('\n')

/** The line under the parts while a reading is under way. */
export const rereadingText = (changed: number): string =>
  `Rereading ${plural(changed, 'changed session')}: the Road shows any change.`

/** The line under the parts while a reading started earlier is still going. */
export const STILL_READING = 'Still reading the sessions: the Road shows the level when it is back.'

/** What /quest-hud:level-up answers before there is any level. */
export const NO_LEVEL_YET = 'No level yet: /quest-hud:level reads it first.'

/** What the log says when the level could not be kept: it stays on screen, and the next run reads everything. */
export const levelLogText = ({ level, title }: LevelCard, isKept: boolean): string =>
  `Lv ${level} ${title}${isKept ? '' : ' · not kept, read again next time'}`

const PART_WIDTH = 12

const barOf = (score: number | undefined): string =>
  score === undefined ? '···' : '█'.repeat(score).padEnd(3, '░')

/** What /quest-hud:level answers: the level, then each part with what was counted. */
export const levelText = ({ level, title, points, outOf, parts, usage }: LevelCard): string => {
  const window = usage.isRead ? `${plural(usage.sessions, 'session')}, ${plural(usage.days, 'day')}` : 'usage unread'

  return [
    `⚔ Level ${level} · ${title}   ${points}/${outOf} · ${window}`,
    ...parts.map(part => `  ${part.name.padEnd(PART_WIDTH)}  ${barOf(part.score)}  ${part.note}`),
    "A game's level, not a benchmark: it reads your setup, never you. /quest-hud:level-up for quests.",
  ].join('\n')
}

/** What /quest-hud:level-up answers. */
export const levelUpText = (card: LevelCard, inventory: Inventory): string => {
  const next = pointsToNext(card.points, card.outOf)
  const head = next === undefined
    ? `⚔ Level ${card.level}: the road is walked. What is left is side roads.`
    : `⚔ Quests for level ${card.level + 1}   (${plural(next, 'point')} away)`

  return [
    head,
    ...pickQuests(inventory, card.usage, MAX_QUESTS).flatMap(quest => [
      `  ▸ ${quest.title} · ${quest.tag}`,
      `    ${quest.why}`,
      ...quest.act.map(act => `    ${act}`),
    ]),
    `Commands are printed, never run. A skill runs with your permissions: read a pack before you install it. Catalogue checked ${CATALOGUE_CHECKED}.`,
  ].join('\n')
}
