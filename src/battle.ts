// バトル提案ロジック（画面に依存しない純粋な計算）。
// 実数値とダメージ計算（calc.ts）で、与ダメージ・被ダメージ・倒すまでの回数・先手後手を求め、
// 項目別（選出・攻撃・受け・素早さ・注意点）の行動指示に組み立てる。
import { calcDamage, defTypesOf, describeKo, otherStat, statsOf } from './calc.ts'
import type { Combatant, DamageResult } from './calc.ts'
import { abilityAdjusted, abilityBlocks, effectiveness, effLabel } from './typeEff.ts'
import type { GameData, GameId, MoveData, OwnedPokemon, PokemonData, StatKey, Stats } from './types.ts'

export { effLabel }

export interface Enemy {
  slug: string
  /** 不明なら null */
  level: number | null
  /** 不明なら null */
  ability: string | null
  /** テラスタルしている場合のタイプ（stellar 含む）。していなければ null */
  tera: string | null
  /** 分かっている相手の技（最大4つ） */
  moves: (number | null)[]
}

export interface BattleOptions {
  game: GameId
  /** 相手を強めに見積もる（努力値252・性格補正あり）。false なら努力値0・補正なし */
  strong: boolean
  weather: 'sun' | 'rain' | null
  /** 自分もテラスタルする（登録したテラスタイプを使う） */
  myTera: boolean
}

const z = (v: number): Stats => ({ hp: v, atk: v, def: v, spa: v, spd: v, spe: v })

/** 相手のタイプ一致技のタイプ（テラスタルしても元のタイプの一致は残る） */
export function enemyAtkTypes(enemy: Enemy, p: PokemonData): string[] {
  const set = new Set(p.types)
  if (enemy.tera && enemy.tera !== 'stellar') set.add(enemy.tera)
  return [...set]
}

export interface MoveEval {
  move: MoveData
  /** タイプ相性（特性込み）。計算できない技でも出す */
  eff: number
  stab: boolean
  calc: DamageResult | null
  /** 命中を掛けた平均ダメージ（相手最大HPに対する%）。計算できない技は 0 */
  expectedPct: number
}

export interface Threat {
  move: MoveData
  /** 相手の技が分からず、タイプ一致技（威力90）と仮定したもの */
  assumed: boolean
  calc: DamageResult | null
}

export interface SpeedEval {
  mine: number
  enemyMin: number
  enemyMax: number
  verdict: 'faster' | 'slower' | 'unclear'
  /** 敵Lvが不明で、自分のLvと同じと仮定したとき true */
  assumedLevel: boolean
  scarf: boolean
}

export type Outcome = 'win' | 'close' | 'lose' | 'none'

export interface MonEval {
  mon: OwnedPokemon
  species: PokemonData
  inParty: boolean
  moves: MoveEval[]
  best: MoveEval | null
  threats: Threat[]
  worst: Threat | null
  /** 相手のタイプ一致技（または分かっている技）を受けたときの最悪のタイプ倍率 */
  defenseWorst: number
  /** 最悪の被ダメージ（自分の最大HPに対する平均%）。分からなければ 0 */
  worstPct: number
  myHp: number
  /** 自分が相手を倒すのに必要な回数（平均ダメージで）／相手が自分を倒すのに必要な回数 */
  hitsToKo: number
  hitsToBeKo: number
  speed: SpeedEval
  /** 自分の先制技（有効打になるもの） */
  priorityMove: MoveEval | null
  outcome: Outcome
  total: number
  /** 計算で考慮した補正（持ち物・特性など） */
  applied: string[]
}

// ---- 戦闘員の組み立て ----

function ownCombatant(data: GameData, mon: OwnedPokemon, species: PokemonData, opt: BattleOptions): Combatant {
  return {
    species,
    level: mon.level,
    ivs: mon.ivs,
    evs: mon.evs,
    nature: mon.nature,
    ability: mon.ability || null,
    item: data.itemByName.get(mon.item)?.slug ?? null,
    tera: opt.myTera && mon.teraType ? mon.teraType : null,
  }
}

function enemyCombatant(enemy: Enemy, species: PokemonData, level: number, strong: boolean): Combatant {
  const strongMult: Partial<Record<StatKey, number>> = { atk: 1.1, def: 1.1, spa: 1.1, spd: 1.1, spe: 1.1 }
  return {
    species,
    level,
    ivs: z(31),
    evs: strong ? z(252) : z(0),
    nature: 'まじめ',
    natureMults: strong ? strongMult : undefined,
    ability: enemy.ability,
    item: null,
    tera: enemy.tera,
  }
}

const typeName = (data: GameData, slug: string) => data.types.types.find((t) => t.slug === slug)?.name ?? slug
const typeList = (data: GameData, slugs: string[]) => slugs.map((t) => typeName(data, t)).join('・')
export const monName = (mon: OwnedPokemon, data: GameData) => {
  const base = data.pokemonBySlug.get(mon.slug)?.name ?? mon.slug
  return mon.nickname ? `${mon.nickname}（${base}）` : base
}

/** 相手の技が分からないときの、タイプ一致技の想定（威力90・相手の高い方の攻撃で） */
function assumedMoves(data: GameData, enemy: Enemy, p: PokemonData): MoveData[] {
  const cls: MoveData['class'] = p.stats.atk >= p.stats.spa ? 'physical' : 'special'
  return enemyAtkTypes(enemy, p).map((t, i) => ({
    id: -1 - i,
    slug: `assumed-${t}`,
    name: `${typeName(data, t)}タイプの一致技（想定・威力90）`,
    type: t,
    class: cls,
    power: 90,
    accuracy: 100,
    pp: null,
    priority: 0,
  }))
}

const cap = (n: number, hi: number) => (Number.isFinite(n) ? Math.min(n, hi) : hi)

export function evaluateMon(
  data: GameData, enemy: Enemy, enemyP: PokemonData, mon: OwnedPokemon, inParty: boolean, opt: BattleOptions,
): MonEval | null {
  const species = data.pokemonBySlug.get(mon.slug)
  if (!species) return null
  const me = ownCombatant(data, mon, species, opt)
  const enemyLevel = enemy.level ?? mon.level
  const foe = enemyCombatant(enemy, enemyP, enemyLevel, opt.strong)
  const myStats = statsOf(me)
  const foeStats = statsOf(foe)
  const calcOpt = { game: opt.game, weather: opt.weather }
  const applied = new Set<string>()

  // --- 自分の攻撃 ---
  const moves: MoveEval[] = []
  for (const id of mon.moves) {
    const move = id != null ? data.moves.get(id) : undefined
    if (!move || move.class === 'status') continue
    const rawEff = effectiveness(data, move.type, defTypesOf(foe))
    const eff = abilityAdjusted(enemy.ability, move.type, rawEff)
    const calc = calcDamage(data, me, foe, move, calcOpt)
    calc?.applied.forEach((a) => applied.add(a))
    moves.push({
      move, eff, stab: species.types.includes(move.type), calc,
      expectedPct: calc ? calc.avgPct * ((move.accuracy ?? 100) / 100) : 0,
    })
  }
  moves.sort((a, b) => b.expectedPct - a.expectedPct)
  const best = moves[0] && moves[0].expectedPct > 0 ? moves[0] : null

  // --- 相手の攻撃（分かっている技。無ければタイプ一致技を想定） ---
  const known = enemy.moves
    .map((id) => (id != null ? data.moves.get(id) : undefined))
    .filter((m): m is MoveData => !!m && m.class !== 'status')
  const useAssumed = known.length === 0
  const threatMoves = useAssumed ? assumedMoves(data, enemy, enemyP) : known
  const threats: Threat[] = threatMoves
    .map((move) => ({ move, assumed: useAssumed, calc: calcDamage(data, foe, me, move, calcOpt) }))
    .sort((a, b) => (b.calc?.avgPct ?? 0) - (a.calc?.avgPct ?? 0))
  const worst = threats[0] && (threats[0].calc?.avg ?? 0) > 0 ? threats[0] : null

  // タイプ倍率だけで見た最悪値（一覧表示用）
  let defenseWorst = 0
  for (const t of threats) {
    const m = abilityAdjusted(mon.ability, t.move.type, effectiveness(data, t.move.type, defTypesOf(me)))
    defenseWorst = Math.max(defenseWorst, m)
  }

  // --- 素早さ ---
  let mineSpe = myStats.spe
  const scarf = me.item === 'choice-scarf'
  if (scarf) mineSpe = Math.floor(mineSpe * 1.5)
  const enemyMin = otherStat(enemyP.stats.spe, enemyLevel, 0, 0, 0.9)
  const enemyMax = otherStat(enemyP.stats.spe, enemyLevel, 31, 252, 1.1)
  const verdict = mineSpe > enemyMax ? 'faster' : mineSpe < enemyMin ? 'slower' : 'unclear'
  const speed: SpeedEval = { mine: mineSpe, enemyMin, enemyMax, verdict, assumedLevel: enemy.level == null, scarf }
  const priorityMove = moves.find((m) => m.move.priority > 0 && m.eff > 0 && m.calc) ?? null

  // --- 勝ち筋: 倒すまでの回数の比べ合い ---
  const myAvg = best?.calc ? best.calc.avg * ((best.move.accuracy ?? 100) / 100) : 0
  const hitsToKo = myAvg > 0 ? Math.ceil(foeStats.hp / myAvg) : Infinity
  const theirAvg = worst?.calc?.avg ?? 0
  const hitsToBeKo = theirAvg > 0 ? Math.ceil(myStats.hp / theirAvg) : Infinity
  let outcome: Outcome = 'none'
  if (best) {
    const first = verdict === 'faster'
    if (hitsToKo < hitsToBeKo) outcome = 'win'
    else if (hitsToKo > hitsToBeKo) outcome = 'lose'
    else outcome = first ? 'win' : verdict === 'slower' ? 'lose' : 'close'
  }
  const outcomeScore = { win: 30, close: 20, lose: 10, none: 0 }[outcome]
  const margin = cap(hitsToBeKo, 6) - cap(hitsToKo, 6)
  const total = best ? outcomeScore + margin + Math.min(best.expectedPct, 100) / 100 : 0

  return {
    mon, species, inParty, moves, best, threats, worst, defenseWorst,
    worstPct: worst?.calc?.avgPct ?? 0, myHp: myStats.hp,
    hitsToKo, hitsToBeKo, speed, priorityMove, outcome, total, applied: [...applied],
  }
}

// ---- 提案の組み立て ----

export interface TmSuggestion {
  label: string
  move: MoveData
  eff: number
}

export interface Advice {
  enemy: PokemonData
  /** 総合順 */
  ranking: MonEval[]
  pick: MonEval | null
  headline: string
  attack: string[]
  defense: string[]
  speed: string[]
  cautions: string[]
  /** 選出ポケモンが技マシンで覚えられる、有効な技 */
  tmIdeas: TmSuggestion[]
  /** 相手のHP（想定）。表示用 */
  enemyHp: number
}

const times = (n: number) => (Number.isFinite(n) ? `${n}発` : '倒せない')

export function advise(
  data: GameData,
  enemy: Enemy,
  mons: { mon: OwnedPokemon; inParty: boolean }[],
  opt: BattleOptions,
  teraGame: boolean,
): Advice | null {
  const enemyP = data.pokemonBySlug.get(enemy.slug)
  if (!enemyP) return null

  const ranking = mons
    .map((m) => evaluateMon(data, enemy, enemyP, m.mon, m.inParty, opt))
    .filter((x): x is MonEval => x !== null)
    .sort((a, b) => b.total - a.total || Number(b.inParty) - Number(a.inParty))

  const pick = ranking[0] && ranking[0].total > 0 ? ranking[0] : null
  const eTypes = enemy.tera && enemy.tera !== 'stellar' ? [enemy.tera] : enemyP.types
  const abName = (slug: string) => data.abilities.get(slug)?.name ?? slug
  const attack: string[] = []
  const defense: string[] = []
  const speed: string[] = []
  const cautions: string[] = []
  const tmIdeas: TmSuggestion[] = []
  const enemyHp = statsOf(enemyCombatant(enemy, enemyP, enemy.level ?? (ranking[0]?.mon.level ?? 50), opt.strong)).hp

  if (ranking.length === 0) {
    return {
      enemy: enemyP, ranking, pick: null, attack, defense, speed, cautions, tmIdeas, enemyHp,
      headline: '手持ちが登録されていません。「手持ち」タブでポケモンと技を登録してください。',
    }
  }

  const who = (m: MonEval) => monName(m.mon, data)
  const dmg = (m: MoveEval) => (m.calc ? describeKo(m.calc) : '計算できません')

  // --- 選出（見出し） ---
  let headline: string
  if (pick && pick.best) {
    const b = pick.best
    const outcomeText = { win: '有利', close: '互角', lose: '不利', none: '' }[pick.outcome]
    headline =
      `${who(pick)}を出して「${b.move.name}」で攻撃（${b.calc ? describeKo(b.calc) : effLabel(b.eff)}）。` +
      `相手の攻撃で倒されるまで${times(pick.hitsToBeKo)}。${outcomeText}`
  } else {
    headline = '有効な技を持つ手持ちがいません。技構成の見直しか、別のポケモンの登録を検討してください。'
  }

  // --- 攻撃 ---
  if (pick && pick.best) {
    for (const m of pick.moves) {
      const mark = m === pick.best ? '◎ ' : ''
      const note = m.eff === 0 ? '（無効）' : ''
      attack.push(`${mark}「${m.move.name}」: ${dmg(m)}${m.stab ? '・タイプ一致' : ''}${note}`)
    }
    if (pick.applied.length) attack.push(`計算に反映: ${pick.applied.join('、')}`)
    for (const other of ranking.slice(1, 3))
      if (other.best && other.total > 0)
        attack.push(`控え候補: ${who(other)}（「${other.best.move.name}」${other.best.calc ? describeKo(other.best.calc) : ''}）`)
  } else {
    attack.push('どの手持ちの技も相手に通りません（無効、攻撃技が未設定、または計算できない技のみ）。')
  }

  // --- 技マシン提案 ---
  const target = pick ?? ranking[0]
  if (target) {
    const known = new Set(target.mon.moves)
    const seen = new Set<number>()
    for (const [id, method] of target.species.moves) {
      if (method !== 'M' || known.has(id) || seen.has(id)) continue
      seen.add(id)
      const move = data.moves.get(id)
      if (!move || move.class === 'status' || (move.power ?? 0) < 60) continue
      const eff = abilityAdjusted(enemy.ability, move.type, effectiveness(data, move.type, eTypes))
      if (eff < 2) continue
      tmIdeas.push({ label: data.machineByMove.get(id) ?? '技マシン', move, eff })
    }
    const val = (t: TmSuggestion) => t.eff * (t.move.power ?? 0) * (target.species.types.includes(t.move.type) ? 1.5 : 1)
    tmIdeas.sort((a, b) => val(b) - val(a))
    tmIdeas.length = Math.min(tmIdeas.length, 3)
  }

  // --- 受け ---
  const first = ranking.find((r) => r.threats.length) ?? ranking[0]
  if (first.threats[0]?.assumed)
    defense.push(`相手の技が分からないため、タイプ一致技（${typeList(data, enemyAtkTypes(enemy, enemyP))}・威力90）を想定。`)
  else defense.push(`相手の技（${first.threats.map((t) => `「${t.move.name}」`).join('')}）から計算。`)
  if (pick)
    for (const t of pick.threats.slice(0, 4))
      defense.push(
        `${t.assumed ? t.move.name : `「${t.move.name}」`} → ${who(pick)}に ${t.calc ? describeKo(t.calc) : '計算できません'}`,
      )
  const byWorst = [...ranking].filter((r) => r.threats.length).sort((a, b) => a.worstPct - b.worstPct)
  const safe = byWorst.filter((r) => r.worstPct < 50)
  const danger = byWorst.filter((r) => r.hitsToBeKo <= 1).reverse()
  if (safe.length)
    defense.push(
      `受け出し向き: ${safe.slice(0, 3).map((r) => `${who(r)}（最大約${Math.round(r.worstPct)}%）`).join('、')}。`,
    )
  else defense.push('相手の攻撃を半分未満で受けられる手持ちはいません。')
  if (danger.length)
    defense.push(`繰り出しを避ける（1発で倒される想定）: ${danger.slice(0, 3).map((r) => who(r)).join('、')}。`)

  // --- 素早さ ---
  if (pick) {
    const s = pick.speed
    const range = `${s.enemyMin}〜${s.enemyMax}`
    const lvNote = s.assumedLevel ? '（相手Lv不明のため、自分と同Lvと仮定）' : ''
    const scarf = s.scarf ? '（こだわりスカーフ込み）' : ''
    if (s.verdict === 'faster')
      speed.push(`${who(pick)}（素早さ${s.mine}${scarf}）は相手（推定${range}）より確実に先手。${lvNote}`)
    else if (s.verdict === 'slower') {
      speed.push(`${who(pick)}（素早さ${s.mine}${scarf}）は相手（推定${range}）より後手。1発耐えられるかを意識する。${lvNote}`)
      if (pick.priorityMove) speed.push(`先制技「${pick.priorityMove.move.name}」で先手を取れる。`)
      else {
        const faster = ranking.find((m) => m.total > 0 && m.speed.verdict === 'faster' && m !== pick)
        if (faster) speed.push(`先手を取りたいなら ${who(faster)} が候補。`)
      }
    } else {
      speed.push(`${who(pick)}（素早さ${s.mine}${scarf}）と相手（推定${range}）は同程度。先手は相手の個体次第。${lvNote}`)
      if (pick.priorityMove) speed.push(`先制技「${pick.priorityMove.move.name}」なら確実に先手。`)
    }
    if (pick.hitsToKo === pick.hitsToBeKo)
      speed.push(`互いに${times(pick.hitsToKo)}で倒す関係なので、先手を取れた方が勝つ。`)
  } else speed.push('選出が決まらないため、素早さの比較はできません。')

  // --- 注意点 ---
  if (enemy.tera) {
    if (enemy.tera === 'stellar') cautions.push('相手はステラテラスタル。タイプは変わらず、技の威力が上がる。')
    else
      cautions.push(
        `相手はテラスタル（${typeName(data, enemy.tera)}）。弱点・耐性が${typeName(data, enemy.tera)}タイプ基準に変わる。元のタイプ一致技（${typeList(data, enemyP.types)}）にも注意。`,
      )
  } else if (teraGame) {
    cautions.push('相手がテラスタルすると弱点が変わる。テラスタイプが分かれば入力してください。')
  }
  if (pick && pick.best) {
    if (enemy.ability) {
      if (abilityBlocks(enemy.ability, pick.best.move.type) !== 'none')
        cautions.push(`相手の特性「${abName(enemy.ability)}」の影響を受ける技です（計算には反映済み）。`)
    } else {
      const risky = enemyP.abilities.filter((a) => abilityBlocks(a.slug, pick.best!.move.type) !== 'none')
      if (risky.length)
        cautions.push(
          `相手の特性が「${risky.map((a) => abName(a.slug)).join('」「')}」だと「${pick.best.move.name}」が通りにくい/無効。特性を確認できたら入力を。`,
        )
    }
  }
  if (enemy.level != null && pick) {
    const diff = enemy.level - pick.mon.level
    if (diff >= 5) cautions.push(`相手のLvが${diff}高い。想定より強いこともあるので、慎重に。`)
    else if (diff <= -10) cautions.push(`相手のLvが${-diff}低い。技が効きにくくても押し切れる可能性がある。`)
  }
  if (!enemy.ability && enemyP.abilities.length > 1)
    cautions.push(`相手の特性候補: ${enemyP.abilities.map((a) => abName(a.slug)).join('、')}。`)
  cautions.push(
    `相手の能力は「${opt.strong ? '努力値252・性格補正あり（強め）' : '努力値0・性格補正なし（標準）'}」と想定。` +
      '持ち物・能力ランク・状態異常・壁・フィールド（天候以外）は考慮していません。ダメージは目安です。',
  )

  return { enemy: enemyP, ranking, pick, headline, attack, defense, speed, cautions, tmIdeas, enemyHp }
}
