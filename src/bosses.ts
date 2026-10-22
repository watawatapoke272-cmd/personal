// ボス戦データ（public/data/sv/bosses.json。scripts/build-bosses.py が生成）の型と読み込み
import { useEffect, useState } from 'react'

export interface BossMember {
  slug: string
  /** 表示用（「78（初戦） / 83（再戦）」のように複数のことがある） */
  level: string
  ability: string | null
  item: string | null
  nature: string | null
  /** テラスタイプ（slug）。分かっているものだけ */
  tera: string | null
  moves: number[]
}

export interface BossBattle {
  name: string
  nameJa: string
  classJa: string
  locationJa: string
  /** V=バイオレット, Sc=スカーレット, SV=共通 */
  game: 'V' | 'Sc' | 'SV'
  headingJa: string
  party: BossMember[]
}

export interface RaidPreset {
  title: string
  slug: string
  tera: string
  start: string | null
  end: string | null
}

export interface BossesFile {
  generatedAt: string
  source: string
  extraNames: Record<string, string>
  battles: BossBattle[]
  raids: RaidPreset[]
}

export type BossState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: BossesFile }

let cache: Promise<BossesFile> | undefined

export function useBosses(): BossState {
  const [state, setState] = useState<BossState>({ status: 'loading' })
  useEffect(() => {
    let alive = true
    cache ??= fetch(`${import.meta.env.BASE_URL}data/sv/bosses.json`).then((r) => {
      if (!r.ok) throw new Error(`bosses.json: ${r.status}`)
      return r.json() as Promise<BossesFile>
    })
    cache.then(
      (data) => alive && setState({ status: 'ready', data }),
      (e: unknown) => {
        cache = undefined
        if (alive) setState({ status: 'error', message: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => {
      alive = false
    }
  }, [])
  return state
}

/** 「78（初戦） / 83（再戦）」から最初のレベルを取り出す */
export const firstLevel = (s: string): number | null => {
  const m = /\d+/.exec(s)
  return m ? Math.min(100, Number(m[0])) : null
}
