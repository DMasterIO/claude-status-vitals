import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Vitals } from '../types'

const vitalsAtom = atom({ plugin: 'status-vitals', key: 'vitals' } as const, null)

let compactAt = 60
let account = ''
let branch = ''
let repo = ''

function usd(n: number) {
  return `$${n.toFixed(2)}`
}

function k(n: number) {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`
}

function bar(pct: number) {
  const width = 10
  const p = Math.max(0, Math.min(100, pct))
  const filled = Math.round((p / 100) * width)
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

// Same palette as clean-view: green calm, cyan active, yellow warning, red critical.
function tone(pct: number) {
  if (pct >= 90) return 'red'
  if (pct >= 70) return 'yellow'
  return 'green'
}

function untilReset(resetsAt: string | undefined, nowMs: number) {
  if (!resetsAt) return ''
  const mins = Math.max(0, Math.round((Date.parse(resetsAt) - nowMs) / 60000))
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `↻ ${d}d ${h}h`
  if (h > 0) return `↻ ${h}h ${m}m`
  return `↻ ${m}m`
}

async function git($: any, args: string[]) {
  try {
    const r = await $.process.run(['git', ...args])
    return r.exitCode === 0 ? String(r.stdout).trim() : ''
  } catch {
    return ''
  }
}

async function loadAccount($: any) {
  try {
    const dir =
      (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    const raw = await $.fs.read(`${dir}/.claude.json`)
    account = JSON.parse(raw)?.oauthAccount?.emailAddress ?? ''
  } catch {
    account = ''
  }
}

async function loadBranch($: any) {
  const name = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (!name) {
    branch = ''
    repo = ''
    return
  }
  // The common dir is the main checkout's .git, so a worktree reports its repo, not its folder.
  const top = await git($, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const root = top.endsWith('/.git') ? top.slice(0, -5) : await git($, ['rev-parse', '--show-toplevel'])
  repo = root.split('/').filter(Boolean).pop() ?? ''
  const dir = await git($, ['rev-parse', '--path-format=absolute', '--git-dir'])
  const common = await git($, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  branch = dir && common && dir !== common ? `${name} (worktree)` : name
}

async function refresh($: any) {
  // Older versions of this mod pinned their text in the status line; the band replaced it.
  $.ui.status(undefined)
  const u = await $.session.usage()
  const now = await $.clock.now()
  const five = u.rateLimits.find((r: any) => r.kind === 'five_hour')
  const week = u.rateLimits.find((r: any) => r.kind === 'seven_day')
  const c = u.context
  const vitals: Vitals = {
    account,
    repo,
    branch,
    cost: u.cost ? usd(u.cost.usd) : '',
    five: five
      ? { label: '5h', pct: five.percentUsed, reset: untilReset(five.resetsAt, now) }
      : null,
    week: week
      ? { label: 'wk', pct: week.percentUsed, reset: untilReset(week.resetsAt, now) }
      : null,
    ctx: { pct: c.percent ?? 0, detail: `${k(c.tokens ?? 0)}/${k(c.window)}` },
  }
  await update($, vitalsAtom, () => vitals)
}

export const register: Register = (on, options) => {
  compactAt = Number(options?.compactAt ?? 60)

  on('session.start', async ($, e, next) => {
    await Promise.all([loadAccount($), loadBranch($)])
    await refresh($)
    // Relee rama y uso cada minuto aunque no haya eventos.
    $.clock.every(60000, async () => {
      await loadBranch($)
      await refresh($)
    })
    return next(e)
  })
  on('session.measure', async ($, e, next) => {
    await refresh($)
    return next(e)
  })
  on('turn.complete', async ($, e, next) => {
    await loadBranch($)
    await refresh($)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const v = await read($, vitalsAtom)
    if (e.props.hasSurvey || v === null) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const meter = (m: NonNullable<Vitals['five']>) => (
      <Box>
        <Text dimColor>{`${m.label} `}</Text>
        <Text color={tone(m.pct)}>{bar(m.pct)}</Text>
        <Text>{` ${m.pct}% `}</Text>
        <Text dimColor>{m.reset}</Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Box>
          {v.account ? <Text color="cyan">{v.account}</Text> : null}
          {v.repo ? <Text dimColor>{`  `}</Text> : null}
          {v.repo ? <Text color="cyan" bold>{v.repo}</Text> : null}
          {v.branch ? <Text dimColor>{`  ⎇ `}</Text> : null}
          {v.branch ? <Text color="cyan" bold>{v.branch}</Text> : null}
          {v.cost ? <Text dimColor>{`  ·  session `}</Text> : null}
          {v.cost ? <Text>{v.cost}</Text> : null}
        </Box>
        <Box>
          {v.five ? meter(v.five) : null}
          {v.five && v.week ? <Text dimColor>{'   │   '}</Text> : null}
          {v.week ? meter(v.week) : null}
        </Box>
        {v.ctx ? (
          <Box>
            <Text dimColor>{'ctx '}</Text>
            <Text color={tone(v.ctx.pct)}>{bar(v.ctx.pct)}</Text>
            <Text>{` ${v.ctx.pct}% `}</Text>
            <Text dimColor>{`(${v.ctx.detail})`}</Text>
            {v.ctx.pct >= compactAt ? (
              <Text color="yellow" bold>{'  ✂ time to compact'}</Text>
            ) : null}
          </Box>
        ) : null}
      </Box>
    )
  })
}
