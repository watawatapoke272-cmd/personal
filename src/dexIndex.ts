import type { GameData, PokemonData } from './types'

export interface Learner {
  p: PokemonData
  /** 覚え方（L/M/E/T…）。重複なし */
  methods: string[]
}

const cache = new WeakMap<GameData, Map<number, Learner[]>>()

/** 技ID → その技を覚えるポケモン一覧（初回だけ全件を走査して作る） */
export function learnersOf(data: GameData, moveId: number): Learner[] {
  let idx = cache.get(data)
  if (!idx) {
    idx = new Map()
    for (const p of data.pokemon) {
      const mine = new Map<number, Set<string>>()
      for (const [id, method] of p.moves) {
        let s = mine.get(id)
        if (!s) mine.set(id, (s = new Set()))
        s.add(method)
      }
      for (const [id, s] of mine) {
        let arr = idx.get(id)
        if (!arr) idx.set(id, (arr = []))
        arr.push({ p, methods: [...s] })
      }
    }
    cache.set(data, idx)
  }
  return idx.get(moveId) ?? []
}

/** 図鑑番号の最小値（ソフトの図鑑にいない個体は末尾へ） */
export const dexOrder = (p: PokemonData) => Math.min(...Object.values(p.dex), 9999)

export const METHOD_LABEL: Record<string, string> = {
  L: 'レベル', M: '技マシン', E: 'タマゴ', T: '教え技', F: 'フォルム変化',
}
