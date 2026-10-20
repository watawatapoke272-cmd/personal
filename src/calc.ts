// ダメージ計算（第8・9世代の式に基づく目安）。画面に依存しない純粋な計算。
//
// 考慮するもの: 実数値（Lv・努力値・個体値・性格）、タイプ相性、タイプ一致（テラスタル含む）、天候（晴れ/雨）、
//   主な持ち物（こだわり系・いのちのたま・タイプ強化・とつげきチョッキ等）、主な特性（てきおうりょく・ちからもち等）、
//   連続技、固定ダメージ技。乱数は85〜100%の16通り。
// 考慮しないもの: 能力ランク、状態異常、急所、壁、フィールド、ダブルの範囲補正、多くの特性・持ち物、重さ依存の技など。
// 各段階で切り捨てる簡易計算のため、実際のゲームと1程度ずれることがある。
import { NATURES } from './natures.ts'
import { abilityAdjusted, effectiveness } from './typeEff.ts'
import type { GameData, GameId, MoveData, PokemonData, StatKey, Stats } from './types.ts'

export interface Combatant {
  species: PokemonData
  level: number
  ivs: Stats
  evs: Stats
  nature: string
  /** 能力ごとの性格補正を直接指定する（相手を「強め」に見積もるとき用）。無ければ性格名から決める */
  natureMults?: Partial<Record<StatKey, number>>
  ability: string | null
  /** 持ち物の slug（なし・不明は null） */
  item: string | null
  /** テラスタルしているときのタイプ（stellar 含む）。していなければ null */
  tera: string | null
}

export const natureMult = (c: Pick<Combatant, 'nature' | 'natureMults'>, stat: StatKey): number => {
  if (c.natureMults?.[stat] !== undefined) return c.natureMults[stat]!
  const n = NATURES.find((x) => x.name === c.nature)
  return !n ? 1 : n.up === stat ? 1.1 : n.down === stat ? 0.9 : 1
}

/** HP以外の実数値 */
export function otherStat(base: number, level: number, iv: number, ev: number, nat: number): number {
  return Math.floor((Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5) * nat)
}
export function hpStat(base: number, level: number, iv: number, ev: number): number {
  if (base === 1) return 1 // ヌケニン
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10
}

export function statsOf(c: Combatant): Stats {
  const b = c.species.stats
  const o = (k: StatKey) => otherStat(b[k], c.level, c.ivs[k], c.evs[k], natureMult(c, k))
  return { hp: hpStat(b.hp, c.level, c.ivs.hp, c.evs.hp), atk: o('atk'), def: o('def'), spa: o('spa'), spd: o('spd'), spe: o('spe') }
}

/** 防御するときのタイプ（テラスタルすると、そのタイプ単独。ステラは変わらない） */
export const defTypesOf = (c: Combatant): string[] =>
  c.tera && c.tera !== 'stellar' ? [c.tera] : c.species.types

// ---- 持ち物・特性の補正表 ----
const TYPE_BOOST_ITEMS: Record<string, string> = {
  charcoal: 'fire', 'mystic-water': 'water', magnet: 'electric', 'miracle-seed': 'grass', 'never-melt-ice': 'ice',
  'black-belt': 'fighting', 'poison-barb': 'poison', 'soft-sand': 'ground', 'sharp-beak': 'flying',
  'twisted-spoon': 'psychic', 'silver-powder': 'bug', 'hard-stone': 'rock', 'spell-tag': 'ghost',
  'dragon-fang': 'dragon', 'black-glasses': 'dark', 'metal-coat': 'steel', 'silk-scarf': 'normal',
  'fairy-feather': 'fairy',
  'flame-plate': 'fire', 'splash-plate': 'water', 'zap-plate': 'electric', 'meadow-plate': 'grass',
  'icicle-plate': 'ice', 'fist-plate': 'fighting', 'toxic-plate': 'poison', 'earth-plate': 'ground',
  'sky-plate': 'flying', 'mind-plate': 'psychic', 'insect-plate': 'bug', 'stone-plate': 'rock',
  'spooky-plate': 'ghost', 'draco-plate': 'dragon', 'dread-plate': 'dark', 'iron-plate': 'steel',
  'pixie-plate': 'fairy',
}

/** 固定ダメージ技（レベル分・固定値・相手HPの半分） */
const FIXED_DAMAGE: Record<string, (atk: Combatant, defHp: number) => number> = {
  'seismic-toss': (a) => a.level,
  'night-shade': (a) => a.level,
  'dragon-rage': () => 40,
  'sonic-boom': () => 20,
  'super-fang': (_a, hp) => Math.max(1, Math.floor(hp / 2)),
  'natures-madness': (_a, hp) => Math.max(1, Math.floor(hp / 2)),
  ruination: (_a, hp) => Math.max(1, Math.floor(hp / 2)),
}
const FIXED_TYPE_IMMUNE: Record<string, string> = { 'seismic-toss': 'ghost', 'night-shade': 'normal' }

export interface CalcOptions {
  game: GameId
  weather?: 'sun' | 'rain' | null
}

export interface DamageResult {
  /** 1回あたりの乱数16通り（小さい順） */
  rolls: number[]
  /** 連続技のとき、1回あたりでなく回数分の合計 */
  min: number
  max: number
  hp: number
  minPct: number
  maxPct: number
  avg: number
  avgPct: number
  /** 連続技の回数（連続技でなければ 1/1） */
  hits: [number, number]
  /** 確定で倒すのに必要な回数（最小乱数で）／倒せる可能性のある最小回数（最大乱数で）。倒せないとき Infinity */
  sureHits: number
  bestHits: number
  /** 1回の技で倒せる乱数の割合（0〜1。連続技を含めず、1回の技の乱数のみで判定） */
  ohkoChance: number
  eff: number
  /** この計算で考慮した補正（日本語） */
  applied: string[]
}

const nameOf = (data: GameData, kind: 'item' | 'ability', slug: string | null) =>
  !slug ? '' : kind === 'item' ? (data.items.find((i) => i.slug === slug)?.name ?? slug) : (data.abilities.get(slug)?.name ?? slug)

/** 技 1 つのダメージ。計算できない技（威力不定・変化技など）は null */
export function calcDamage(
  data: GameData, atk: Combatant, def: Combatant, move: MoveData, opt: CalcOptions,
): DamageResult | null {
  if (move.class === 'status') return null
  const applied: string[] = []
  const A = statsOf(atk)
  const D = statsOf(def)
  const defTypes = defTypesOf(def)

  // 技のタイプ（テラバーストは、テラスタル中はそのタイプ）
  let type = move.type
  let cls: 'physical' | 'special' = move.class === 'physical' ? 'physical' : 'special'
  if (move.slug === 'tera-blast' && atk.tera && atk.tera !== 'stellar') {
    type = atk.tera
    cls = A.atk >= A.spa ? 'physical' : 'special'
  }

  const rawEff = effectiveness(data, type, defTypes)
  const eff = abilityAdjusted(def.ability, type, rawEff)
  if (def.ability && eff !== rawEff) applied.push(`相手の特性「${nameOf(data, 'ability', def.ability)}」`)

  const hits: [number, number] = [move.minHits ?? 1, move.maxHits ?? 1]
  const fixed = FIXED_DAMAGE[move.slug]
  const finish = (rolls: number[]): DamageResult => {
    const hp = D.hp
    const min = rolls[0] * hits[0]
    const max = rolls[rolls.length - 1] * hits[1]
    const avg = (rolls.reduce((s, r) => s + r, 0) / rolls.length) * ((hits[0] + hits[1]) / 2)
    return {
      rolls, min, max, hp, avg,
      minPct: (min / hp) * 100, maxPct: (max / hp) * 100, avgPct: (avg / hp) * 100,
      hits,
      sureHits: min > 0 ? Math.ceil(hp / min) : Infinity,
      bestHits: max > 0 ? Math.ceil(hp / max) : Infinity,
      ohkoChance: rolls.filter((r) => r >= hp).length / rolls.length,
      eff, applied,
    }
  }

  if (fixed) {
    const immune = FIXED_TYPE_IMMUNE[move.slug]
    const dmg = immune && defTypes.includes(immune) ? 0 : fixed(atk, D.hp)
    applied.push('固定ダメージの技')
    return finish(Array(16).fill(dmg))
  }
  if (move.power == null) return null
  if (eff === 0) return finish(Array(16).fill(0))

  // 攻撃側・防御側の参照する能力値
  let atkKey: StatKey = cls === 'physical' ? 'atk' : 'spa'
  let defKey: StatKey = cls === 'physical' ? 'def' : 'spd'
  if (move.slug === 'body-press') atkKey = 'def'
  if (['psyshock', 'psystrike', 'secret-sword'].includes(move.slug)) defKey = 'def'
  let a = move.slug === 'foul-play' ? D.atk : A[atkKey]
  let d = D[defKey]
  const ownStat = move.slug !== 'foul-play'

  // ---- 能力値の補正 ----
  const aMul: [number, string][] = []
  if (ownStat && atk.ability && ['huge-power', 'pure-power'].includes(atk.ability) && atkKey === 'atk')
    aMul.push([2, nameOf(data, 'ability', atk.ability)])
  if (ownStat && atk.ability === 'hustle' && atkKey === 'atk') aMul.push([1.5, nameOf(data, 'ability', atk.ability)])
  if (ownStat && atk.item === 'choice-band' && atkKey === 'atk') aMul.push([1.5, nameOf(data, 'item', atk.item)])
  if (ownStat && atk.item === 'choice-specs' && atkKey === 'spa') aMul.push([1.5, nameOf(data, 'item', atk.item)])
  if (ownStat && atk.item === 'light-ball' && atk.species.species === 'pikachu' && (atkKey === 'atk' || atkKey === 'spa'))
    aMul.push([2, nameOf(data, 'item', atk.item)])
  if (ownStat && atk.item === 'thick-club' && ['cubone', 'marowak'].includes(atk.species.species) && atkKey === 'atk')
    aMul.push([2, nameOf(data, 'item', atk.item)])
  for (const [m, label] of aMul) { a = Math.floor(a * m); applied.push(`${label}（攻撃×${m}）`) }

  const dMul: [number, string][] = []
  if (def.item === 'assault-vest' && defKey === 'spd') dMul.push([1.5, nameOf(data, 'item', def.item)])
  if (def.ability === 'fur-coat' && defKey === 'def') dMul.push([2, nameOf(data, 'ability', def.ability)])
  for (const [m, label] of dMul) { d = Math.floor(d * m); applied.push(`${label}（防御×${m}）`) }

  // ---- 威力の補正 ----
  let power = move.power
  const pMul: [number, string][] = []
  if (atk.ability === 'technician' && power <= 60) pMul.push([1.5, nameOf(data, 'ability', atk.ability)])
  if (atk.ability === 'transistor' && type === 'electric') pMul.push([opt.game === 'sv' ? 1.3 : 1.5, nameOf(data, 'ability', atk.ability)])
  if (atk.ability === 'dragons-maw' && type === 'dragon') pMul.push([1.5, nameOf(data, 'ability', atk.ability)])
  if (atk.ability === 'steelworker' && type === 'steel') pMul.push([1.5, nameOf(data, 'ability', atk.ability)])
  if (atk.ability === 'water-bubble' && type === 'water') pMul.push([2, nameOf(data, 'ability', atk.ability)])
  if (atk.item === 'muscle-band' && cls === 'physical') pMul.push([1.1, nameOf(data, 'item', atk.item)])
  if (atk.item === 'wise-glasses' && cls === 'special') pMul.push([1.1, nameOf(data, 'item', atk.item)])
  if (atk.item && TYPE_BOOST_ITEMS[atk.item] === type) pMul.push([1.2, nameOf(data, 'item', atk.item)])
  for (const [m, label] of pMul) { power = Math.floor(power * m); applied.push(`${label}（威力×${m}）`) }

  // ---- 基本ダメージ ----
  let base = Math.floor(Math.floor((Math.floor((2 * atk.level) / 5 + 2) * power * a) / d) / 50) + 2
  if (opt.weather === 'sun' && type === 'fire') { base = Math.floor(base * 1.5); applied.push('晴れ（ほのお×1.5）') }
  if (opt.weather === 'sun' && type === 'water') { base = Math.floor(base * 0.5); applied.push('晴れ（みず×0.5）') }
  if (opt.weather === 'rain' && type === 'water') { base = Math.floor(base * 1.5); applied.push('雨（みず×1.5）') }
  if (opt.weather === 'rain' && type === 'fire') { base = Math.floor(base * 0.5); applied.push('雨（ほのお×0.5）') }

  // ---- タイプ一致 ----
  const hasOrig = atk.species.types.includes(type)
  const hasTera = atk.tera === type
  const adapt = atk.ability === 'adaptability'
  let stab = 1
  if (hasOrig && hasTera) stab = adapt ? 2.25 : 2
  else if (hasOrig || hasTera) stab = adapt ? 2 : 1.5
  if (stab > 1 && (hasTera || adapt)) applied.push(`タイプ一致×${stab}${hasTera ? '（テラスタル）' : ''}`)

  // ---- 最終補正 ----
  const final: [number, string][] = []
  if (atk.item === 'life-orb') final.push([1.3, nameOf(data, 'item', atk.item)])
  if (atk.item === 'expert-belt' && eff > 1) final.push([1.2, nameOf(data, 'item', atk.item)])
  if (atk.ability === 'tinted-lens' && eff < 1) final.push([2, nameOf(data, 'ability', atk.ability)])
  if (def.ability && ['multiscale', 'shadow-shield'].includes(def.ability)) final.push([0.5, `${nameOf(data, 'ability', def.ability)}（HP満タン）`])
  if (def.ability && ['filter', 'solid-rock', 'prism-armor'].includes(def.ability) && eff > 1)
    final.push([0.75, nameOf(data, 'ability', def.ability)])
  if (def.ability === 'ice-scales' && cls === 'special') final.push([0.5, nameOf(data, 'ability', def.ability)])
  for (const [m, label] of final) applied.push(`${label}（ダメージ×${m}）`)

  const rolls: number[] = []
  for (let r = 85; r <= 100; r++) {
    let dmg = Math.floor((base * r) / 100)
    dmg = Math.floor(dmg * stab)
    dmg = Math.floor(dmg * eff)
    for (const [m] of final) dmg = Math.floor(dmg * m)
    rolls.push(Math.max(1, dmg))
  }
  return finish(rolls)
}

/** ダメージ結果の文章（例: 「45〜53%（確定2発）」） */
export function describeKo(r: DamageResult): string {
  if (r.max === 0) return 'ダメージなし'
  const range = `${Math.round(r.minPct)}〜${Math.round(r.maxPct)}%`
  if (r.sureHits === 1) return `${range}（確定1発）`
  if (r.bestHits === 1) return `${range}（乱数1発 ${Math.round(r.ohkoChance * 100)}%）`
  if (r.sureHits === r.bestHits) return `${range}（確定${r.sureHits}発）`
  return `${range}（乱数${r.bestHits}発〜確定${Number.isFinite(r.sureHits) ? r.sureHits : '多数'}発）`
}
