import { useCallback, useEffect, useRef, useState } from 'react'
import { mergeSaves, normalizeParty } from './merge'
import type { GameId, GameSave, OwnedPokemon, Stats } from './types'

const KEY = (g: GameId) => `pokemon-app:v1:${g}`
const GAME_KEY = 'pokemon-app:game'
export const PARTY_MAX = 6

export const emptySave = (): GameSave => ({ version: 1, mons: {}, party: [], partyUpdatedAt: 0, deleted: {} })

const zeroStats = (v: number): Stats => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v })

export function newMon(slug: string, ability: string): OwnedPokemon {
  const now = Date.now()
  return {
    id: crypto.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`,
    slug,
    nickname: '',
    level: 50,
    ability,
    item: '',
    teraType: '',
    nature: 'まじめ',
    evs: zeroStats(0),
    ivs: zeroStats(31),
    moves: [null, null, null, null],
    memo: '',
    createdAt: now,
    updatedAt: now,
  }
}

/** 保存データ（または取り込んだJSON）を安全な形に整える。壊れた項目は捨てる */
export function sanitizeSave(raw: unknown): GameSave {
  const out = emptySave()
  if (!raw || typeof raw !== 'object') return out
  const r = raw as Partial<GameSave>
  const stat = (s: unknown, def: number): Stats => {
    const o = (s ?? {}) as Partial<Stats>
    const f = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : def)
    return { hp: f(o.hp), atk: f(o.atk), def: f(o.def), spa: f(o.spa), spd: f(o.spd), spe: f(o.spe) }
  }
  for (const m of Object.values(r.mons ?? {})) {
    if (!m || typeof m.id !== 'string' || typeof m.slug !== 'string') continue
    const base = newMon(m.slug, '')
    out.mons[m.id] = {
      ...base,
      id: m.id,
      nickname: String(m.nickname ?? ''),
      level: Math.min(100, Math.max(1, Number(m.level) || 1)),
      ability: String(m.ability ?? ''),
      item: String(m.item ?? ''),
      teraType: String(m.teraType ?? ''),
      nature: String(m.nature ?? 'まじめ'),
      evs: stat(m.evs, 0),
      ivs: stat(m.ivs, 31),
      moves: [0, 1, 2, 3].map((i) => {
        const v = m.moves?.[i]
        return typeof v === 'number' ? v : null
      }),
      memo: String(m.memo ?? ''),
      createdAt: Number(m.createdAt) || base.createdAt,
      updatedAt: Number(m.updatedAt) || base.updatedAt,
    }
  }
  out.party = (Array.isArray(r.party) ? r.party : [])
    .filter((id, i, a): id is string => typeof id === 'string' && id in out.mons && a.indexOf(id) === i)
    .slice(0, PARTY_MAX)
  out.partyUpdatedAt = Number(r.partyUpdatedAt) || 0
  for (const [id, t] of Object.entries(r.deleted ?? {}))
    if (typeof t === 'number' && Number.isFinite(t) && !(id in out.mons)) out.deleted[id] = t
  return out
}

function load(game: GameId): GameSave {
  try {
    const s = localStorage.getItem(KEY(game))
    return s ? sanitizeSave(JSON.parse(s)) : emptySave()
  } catch {
    return emptySave()
  }
}

export function loadGameChoice(): GameId {
  try {
    const g = localStorage.getItem(GAME_KEY)
    if (g === 'sv' || g === 'swsh') return g
  } catch {}
  return 'sv'
}
export function saveGameChoice(g: GameId) {
  try {
    localStorage.setItem(GAME_KEY, g)
  } catch {}
}

export interface SaveApi {
  save: GameSave
  /** 保存に失敗した（容量不足・保存禁止など）とき true */
  storageError: boolean
  upsert: (m: OwnedPokemon) => void
  remove: (id: string) => void
  /** 'party' なら末尾に追加（満員なら false を返す）、'box' ならパーティから外す */
  moveTo: (id: string, to: 'party' | 'box') => boolean
  reorderParty: (id: string, dir: -1 | 1) => void
  /** 書き出したJSONの読み込み用: 手持ちを丸ごと置き換える（他の端末にも反映されるよう、消えた個体は削除として記録する） */
  replaceAll: (s: GameSave) => void
  /** 同期で受け取った内容を取り込む（ユーザー操作ではないので、再同期は起こさない） */
  mergeIn: (remote: GameSave) => void
  /** ユーザー操作で手持ちが変わるたびに増える番号（自動同期のきっかけ） */
  rev: number
}

/** ソフトごとの手持ちを localStorage に保存するフック */
export function useSave(game: GameId): SaveApi {
  const [state, setState] = useState<{ game: GameId; save: GameSave }>(() => ({ game, save: load(game) }))
  const [storageError, setStorageError] = useState(false)
  // 変更があったときだけ書き込む（読み込んだだけの内容や壊れた保存データで上書きしない）
  const dirty = useRef(false)
  const [rev, setRev] = useState(0)

  // ソフトが切り替わったら、そのソフトの保存データを読み直す
  if (state.game !== game) {
    setState({ game, save: load(game) })
  }

  useEffect(() => {
    if (!dirty.current) return
    dirty.current = false
    try {
      localStorage.setItem(KEY(game), JSON.stringify(state.save))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [state.save, game])

  const apply = useCallback((fn: (s: GameSave) => GameSave) => {
    dirty.current = true
    setState((cur) => ({ ...cur, save: fn(cur.save) }))
  }, [])
  const update = useCallback(
    (fn: (s: GameSave) => GameSave) => {
      apply(fn)
      setRev((r) => r + 1)
    },
    [apply],
  )

  const upsert = useCallback(
    (m: OwnedPokemon) =>
      update((s) => ({ ...s, mons: { ...s.mons, [m.id]: { ...m, updatedAt: Date.now() } } })),
    [update],
  )
  const remove = useCallback(
    (id: string) =>
      update((s) => {
        const mons = { ...s.mons }
        delete mons[id]
        const now = Date.now()
        const wasInParty = s.party.includes(id)
        return {
          ...s,
          mons,
          party: s.party.filter((x) => x !== id),
          deleted: { ...s.deleted, [id]: now },
          partyUpdatedAt: wasInParty ? now : s.partyUpdatedAt,
        }
      }),
    [update],
  )
  const moveTo = useCallback(
    (id: string, to: 'party' | 'box') => {
      let ok = true
      update((s) => {
        if (to === 'box') {
          if (!s.party.includes(id)) return s
          return { ...s, party: s.party.filter((x) => x !== id), partyUpdatedAt: Date.now() }
        }
        if (s.party.includes(id)) return s
        if (s.party.length >= PARTY_MAX) { ok = false; return s }
        return { ...s, party: [...s.party, id], partyUpdatedAt: Date.now() }
      })
      return ok
    },
    [update],
  )
  const reorderParty = useCallback(
    (id: string, dir: -1 | 1) =>
      update((s) => {
        const i = s.party.indexOf(id)
        const j = i + dir
        if (i < 0 || j < 0 || j >= s.party.length) return s
        const party = [...s.party]
        ;[party[i], party[j]] = [party[j], party[i]]
        return { ...s, party, partyUpdatedAt: Date.now() }
      }),
    [update],
  )
  const replaceAll = useCallback(
    (incoming: GameSave) =>
      update((cur) => {
        const now = Date.now()
        const mons = Object.fromEntries(Object.values(incoming.mons).map((m) => [m.id, { ...m, updatedAt: now }]))
        const deleted = { ...cur.deleted }
        for (const id of Object.keys(cur.mons)) if (!(id in mons)) deleted[id] = now
        for (const id of Object.keys(mons)) delete deleted[id]
        return { version: 1, mons, party: incoming.party, deleted, partyUpdatedAt: now }
      }),
    [update],
  )
  const mergeIn = useCallback((remote: GameSave) => apply((cur) => normalizeParty(mergeSaves(cur, remote))), [apply])

  return { save: state.save, storageError, upsert, remove, moveTo, reorderParty, replaceAll, mergeIn, rev }
}
