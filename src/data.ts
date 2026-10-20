import { useEffect, useState } from 'react'
import type {
  AbilityData, GameData, GameId, MachineData, MachineSource, MoveData, PokemonData, TypesFile,
} from './types'

export const GAMES: Record<GameId, { label: string; short: string; hasTera: boolean }> = {
  sv: { label: 'スカーレット・バイオレット', short: 'SV', hasTera: true },
  swsh: { label: 'ソード・シールド', short: '剣盾', hasTera: false },
}

const base = import.meta.env.BASE_URL
async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`)
  if (!res.ok) throw new Error(`${path}: ${res.status}`)
  return res.json() as Promise<T>
}

let typesCache: Promise<TypesFile> | undefined
const gameCache = new Map<GameId, Promise<GameData>>()

function loadGame(game: GameId): Promise<GameData> {
  let p = gameCache.get(game)
  if (!p) {
    p = (async () => {
      const [pokemon, moves, abilities, machines, sources] = await Promise.all([
        getJson<PokemonData[]>(`${game}/pokemon.json`),
        getJson<MoveData[]>(`${game}/moves.json`),
        getJson<AbilityData[]>(`${game}/abilities.json`),
        getJson<MachineData[]>(`${game}/machines.json`),
        // 入手情報は無くてもアプリ自体は動くようにする
        getJson<MachineSource[]>(`${game}/machine-sources.json`).catch(() => [] as MachineSource[]),
      ])
      typesCache ??= getJson<TypesFile>('common/types.json')
      const types = await typesCache
      return {
        pokemon,
        pokemonBySlug: new Map(pokemon.map((x) => [x.slug, x])),
        moves: new Map(moves.map((m) => [m.id, m])),
        abilities: new Map(abilities.map((a) => [a.slug, a])),
        machineByMove: new Map(machines.map((m) => [m.moveId, m.label])),
        machines,
        machineSources: new Map(sources.map((x) => [x.label, x])),
        types,
      } satisfies GameData
    })()
    // 失敗したら次回やり直せるようにキャッシュから外す
    p.catch(() => gameCache.delete(game))
    gameCache.set(game, p)
  }
  return p
}

export type DataState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: GameData }

export function useGameData(game: GameId): DataState {
  const [state, setState] = useState<{ game: GameId; s: DataState }>({
    game,
    s: { status: 'loading' },
  })
  useEffect(() => {
    let alive = true
    loadGame(game).then(
      (data) => alive && setState({ game, s: { status: 'ready', data } }),
      (e: unknown) =>
        alive && setState({ game, s: { status: 'error', message: e instanceof Error ? e.message : String(e) } }),
    )
    return () => {
      alive = false
    }
  }, [game])
  return state.game === game ? state.s : { status: 'loading' }
}

/** 図鑑に載っている個体か（HOME連携のみの個体は false） */
export const inDex = (p: PokemonData) => Object.keys(p.dex).length > 0
