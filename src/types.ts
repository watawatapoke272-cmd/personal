// ---- ゲームデータ（public/data の JSON と対応） ----

export type GameId = 'sv' | 'swsh'

export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export type Stats = Record<StatKey, number>

/** 覚え方: L=レベル M=技マシン/レコード E=タマゴ T=教え技 F=フォルムチェンジ */
export type LearnMethod = 'L' | 'M' | 'E' | 'T' | 'F' | string
export type LearnEntry = [moveId: number, method: LearnMethod, level?: number]

export interface PokemonData {
  id: number
  slug: string
  species: string
  name: string
  isDefault: boolean
  types: string[]
  abilities: { slug: string; hidden: boolean }[]
  stats: Stats
  /** 図鑑名 → 図鑑番号。空ならそのソフトの図鑑に載っていない個体（HOME連携のみ等） */
  dex: Record<string, number>
  moves: LearnEntry[]
}

export interface MoveData {
  id: number
  slug: string
  name: string
  type: string
  class: 'physical' | 'special' | 'status'
  power: number | null
  accuracy: number | null
  pp: number | null
  priority: number
  text?: string
  /** 連続技の回数（2〜5回など）。連続技でなければ無し */
  minHits?: number
  maxHits?: number
}

export interface ItemData {
  slug: string
  name: string
  cat: string
  text?: string
}

export interface AbilityData {
  slug: string
  name: string
  text?: string
}

export interface MachineData {
  label: string
  kind: 'tm' | 'tr'
  moveId: number
}

/** 技マシン/技レコードの入手情報（SV・剣盾で入る項目が違う） */
export interface MachineSource {
  label: string
  // SV
  unlock?: string
  lp?: number
  materials?: { name: string; count: number }[]
  // SV / 剣盾TR（拾える固定の場所）
  places?: string[]
  // 剣盾TM
  area?: string
  how?: string
  price?: number
  // 剣盾TR
  watt?: number
  raidDrops?: { both: string[]; sword: string[]; shield: string[] }
}

export interface TypeInfo {
  slug: string
  name: string
}

export interface TypesFile {
  types: TypeInfo[]
  chart: Record<string, Record<string, number>>
}

export interface GameData {
  pokemon: PokemonData[]
  pokemonBySlug: Map<string, PokemonData>
  moves: Map<number, MoveData>
  abilities: Map<string, AbilityData>
  items: ItemData[]
  /** 日本語名 → 持ち物（手持ちには日本語名で保存している） */
  itemByName: Map<string, ItemData>
  /** 技ID → TM/TR 番号 */
  machineByMove: Map<number, string>
  /** 技マシン/レコード一覧（番号順） */
  machines: MachineData[]
  /** 番号（TM001 など）→ 入手情報。取得できなければ空 */
  machineSources: Map<string, MachineSource>
  types: TypesFile
}

// ---- 手持ちデータ（端末内保存・のちにGAS同期） ----

export interface OwnedPokemon {
  /** 個体ID（同種を複数持てる） */
  id: string
  /** PokemonData.slug（フォルム違いは別slug） */
  slug: string
  nickname: string
  level: number
  /** 特性 slug */
  ability: string
  item: string
  /** テラスタイプ（SVのみ）。typeのslugまたは stellar */
  teraType: string
  nature: string
  evs: Stats
  ivs: Stats
  /** 技ID × 4（未設定は null） */
  moves: (number | null)[]
  memo: string
  createdAt: number
  updatedAt: number
}

export interface GameSave {
  version: 1
  mons: Record<string, OwnedPokemon>
  /** パーティ（最大6、先頭が1番手）。ここに無い個体はボックス */
  party: string[]
  /** パーティを最後に変更した時刻（端末間の同期で新しい方を採用するため） */
  partyUpdatedAt: number
  /** 削除した個体 id → 削除時刻（同期で「削除」を他の端末に伝えるため） */
  deleted: Record<string, number>
}
