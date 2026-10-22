// 「ほしいポケモン」のメモ。ソフトごとに端末の localStorage に保存する（端末間の同期の対象外）。
import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameId } from './types'

export interface Wish {
  id: string
  /** PokemonData.slug */
  slug: string
  memo: string
  /** ゲット済み */
  done: boolean
  createdAt: number
}

export interface WishApi {
  list: Wish[]
  has: (slug: string) => boolean
  add: (slug: string, memo?: string) => void
  update: (id: string, patch: Partial<Pick<Wish, 'memo' | 'done'>>) => void
  remove: (id: string) => void
  /** 保存に失敗したとき true */
  storageError: boolean
}

const KEY = (g: GameId) => `pokemon-app:v1:wish:${g}`

function load(game: GameId): Wish[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(game)) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.flatMap((w: Partial<Wish>) =>
      w && typeof w.id === 'string' && typeof w.slug === 'string'
        ? [{ id: w.id, slug: w.slug, memo: String(w.memo ?? ''), done: !!w.done, createdAt: Number(w.createdAt) || 0 }]
        : [],
    )
  } catch {
    return []
  }
}

export function useWishlist(game: GameId): WishApi {
  const [state, setState] = useState<{ game: GameId; list: Wish[] }>(() => ({ game, list: load(game) }))
  const [storageError, setStorageError] = useState(false)
  const dirty = useRef(false)

  if (state.game !== game) setState({ game, list: load(game) })

  useEffect(() => {
    if (!dirty.current) return
    dirty.current = false
    try {
      localStorage.setItem(KEY(game), JSON.stringify(state.list))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [state.list, game])

  const apply = useCallback((fn: (l: Wish[]) => Wish[]) => {
    dirty.current = true
    setState((cur) => ({ ...cur, list: fn(cur.list) }))
  }, [])

  return {
    list: state.list,
    storageError,
    has: (slug) => state.list.some((w) => w.slug === slug && !w.done),
    add: (slug, memo = '') =>
      apply((l) => [
        ...l,
        { id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`, slug, memo, done: false, createdAt: Date.now() },
      ]),
    update: (id, patch) => apply((l) => l.map((w) => (w.id === id ? { ...w, ...patch } : w))),
    remove: (id) => apply((l) => l.filter((w) => w.id !== id)),
  }
}
