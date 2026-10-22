// テラレイド用の絞り込み（画面に依存しない純粋な計算）。
// 「相手の技を半減以下で受けられる」かつ「相手のレイドテラスタイプに抜群を突ける」手持ちを探す。
import { abilityAdjusted, effectiveness } from './typeEff.ts'
import type { GameData, MoveData, OwnedPokemon, PokemonData } from './types.ts'

export interface RaidBoss {
  slug: string
  /** レイドテラスタイプ（stellar 含む） */
  tera: string
  /** 分かっている特性（任意） */
  ability: string | null
}

export interface RaidHit {
  move: MoveData
  /** レイドテラスタイプに対する倍率（特性込み） */
  eff: number
  stab: boolean
}

export interface RaidCandidate {
  mon: OwnedPokemon
  species: PokemonData
  inParty: boolean
  /** 抜群を突ける攻撃技（威力順） */
  hits: RaidHit[]
  /** 相手の攻撃タイプ → こちらが受ける倍率（最悪値が worst） */
  taken: { type: string; mult: number }[]
  worst: number
  /** テラスタルした後（登録したテラスタイプ）の最悪倍率。テラスタイプ未登録なら null */
  worstAfterTera: number | null
  resists: boolean
  hitsSuper: boolean
}

export interface RaidResult {
  boss: PokemonData
  /** 相手が使ってくるタイプ（元のタイプ＋テラスタイプ） */
  attackTypes: string[]
  /** 弱点判定に使う相手の防御タイプ */
  defTypes: string[]
  both: RaidCandidate[]
  onlyResist: RaidCandidate[]
  onlyHit: RaidCandidate[]
}

export function raidAttackTypes(boss: RaidBoss, p: PokemonData): string[] {
  const set = new Set(p.types)
  if (boss.tera !== 'stellar') set.add(boss.tera)
  return [...set]
}

const worstOf = (data: GameData, types: string[], defTypes: string[], ability: string | null) => {
  const taken = types.map((type) => ({
    type,
    mult: abilityAdjusted(ability, type, effectiveness(data, type, defTypes)),
  }))
  return { taken, worst: taken.reduce((m, t) => Math.max(m, t.mult), 0) }
}

export function findRaidCounters(
  data: GameData,
  boss: RaidBoss,
  mons: { mon: OwnedPokemon; inParty: boolean }[],
): RaidResult | null {
  const bossP = data.pokemonBySlug.get(boss.slug)
  if (!bossP) return null
  const attackTypes = raidAttackTypes(boss, bossP)
  // ステラは防御タイプが変わらない（元のタイプのまま）
  const defTypes = boss.tera === 'stellar' ? bossP.types : [boss.tera]

  const all: RaidCandidate[] = []
  for (const { mon, inParty } of mons) {
    const species = data.pokemonBySlug.get(mon.slug)
    if (!species) continue
    const myTypes = species.types
    const { taken, worst } = worstOf(data, attackTypes, myTypes, mon.ability || null)
    const worstAfterTera = mon.teraType
      ? worstOf(data, attackTypes, (mon.teraType === 'stellar' ? myTypes : [mon.teraType]), mon.ability || null).worst
      : null

    const hits: RaidHit[] = []
    for (const id of mon.moves) {
      const move = id != null ? data.moves.get(id) : undefined
      if (!move || move.class === 'status') continue
      const eff = abilityAdjusted(boss.ability, move.type, effectiveness(data, move.type, defTypes))
      if (eff >= 2) hits.push({ move, eff, stab: myTypes.includes(move.type) || mon.teraType === move.type })
    }
    hits.sort((a, b) => b.eff - a.eff || (b.move.power ?? 0) - (a.move.power ?? 0))

    all.push({
      mon, species, inParty, hits, taken, worst, worstAfterTera,
      resists: worst <= 0.5, hitsSuper: hits.length > 0,
    })
  }

  const score = (c: RaidCandidate) =>
    (c.hits[0] ? c.hits[0].eff * (c.hits[0].move.power ?? 60) * (c.hits[0].stab ? 1.5 : 1) : 0) / (c.worst || 0.25)
  const byScore = (a: RaidCandidate, b: RaidCandidate) => score(b) - score(a)
  return {
    boss: bossP, attackTypes, defTypes,
    both: all.filter((c) => c.resists && c.hitsSuper).sort(byScore),
    onlyResist: all.filter((c) => c.resists && !c.hitsSuper).sort((a, b) => a.worst - b.worst),
    onlyHit: all.filter((c) => !c.resists && c.hitsSuper).sort(byScore),
  }
}

/** レイド特有の行動ガイド（ゲーム内の表示が正。仕様は更新されることがあるので目安として） */
export function raidGuidance(data: GameData, boss: RaidBoss, res: RaidResult): string[] {
  const typeName = (s: string) => data.types.types.find((t) => t.slug === s)?.name ?? s
  const lines: string[] = []
  lines.push(
    '【シールド】ボスは一度だけシールドを張る。張っている間、テラスタルしていない攻撃は大幅に軽減される' +
      '（5〜6★の目安: 通常 ×0.2、テラスタル後の不一致技 ×0.35、テラスタイプ一致技 ×0.75）。変化技の効果も防がれる。' +
      'シールドが張られる前にテラスタルして、テラスタイプ一致の技で割るのが基本。割ると、ボスは次のターン動かない。',
  )
  lines.push(
    '【能力アップ解除】ボスの行動で、こちらの能力アップ（つるぎのまい等）が消されることがある。' +
      '積む型は積み直しを見込み、素の火力で抜群を突ける型を混ぜると安定する。',
  )
  lines.push(
    '【特性無効】同じ行動で、次の1ターンだけこちらの特性が無効になる（とくせいガードを持たせた個体や瀕死の個体は対象外）。' +
      '特性前提の火力・耐性（ふゆう、もらいび等）に頼る手持ちは、そのターンの被弾に注意。',
  )
  if (boss.tera === 'stellar') {
    lines.push('ステラのボスは弱点が変わらない（元のタイプのまま）。抜群は元のタイプ基準で探しています。')
  } else {
    lines.push(
      `ボスは${typeName(boss.tera)}テラスタル中なので、防御は${typeName(boss.tera)}単タイプ扱い。` +
        `ただし攻撃は元のタイプ（${res.boss.types.map(typeName).join('・')}）の技も使うため、受けは両方を見ます。`,
    )
  }
  return lines
}
