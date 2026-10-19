export type Meter = { label: string; pct: number; reset: string }

export type Vitals = {
  account: string
  repo: string
  branch: string
  cost: string
  five: Meter | null
  week: Meter | null
  ctx: { pct: number; detail: string } | null
}

declare module 'claude-code' {
  interface PluginState {
    'status-vitals': { vitals: Vitals | null }
  }
}
