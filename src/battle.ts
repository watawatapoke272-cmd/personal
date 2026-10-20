// バトル提案ロジック（画面に依存しない純粋な計算）。
// 方針: タイプ相性 × タイプ一致 × 技の威力 × 命中 の簡易判定。ダメージ計算ではない。
import { NATURES } from './natures.ts'
import type { GameData, MoveData, OwnedPokemon, PokemonData } from './types.ts'

export interface Enemy {
  slug: string
  /** 不明なら null */
  level: number | null
  /** 不明なら null */
  ability: string | null
  /** テラスタルしている場合のタイプ（stellar 含む）。していなければ null */
  tera: string | null
}

/** 特性による、特定タイプの技への倍率補正（0=無効, 0.5=半減） */
const ABILITY_TYPE_MOD: Record<string, Record<string, number>> = {
  levitate: { ground: 0 },
  'earth-eater': { ground: 0 },
  'flash-fire': { fire: 0 },
  'well-baked-body': { fire: 0 },
  'water-absorb': { water: 0 },
  'storm-drain': { water: 0 },
  'dry-skin': { water: 0 },
  'volt-absorb': { electric: 0 },
  'lightning-rod': { electric: 0 },
  'motor-drive': { electric: 0 },
  'sap-sipper': { grass: 0 },
  'thick-fat': { fire: 0.5, ice: 0.5 },
  heatproof: { fire: 0.5 },
  'water-bubble': { fire: 0.5 },
  'purifying-salt': { ghost: 0.5 },
}

/** 防御側の特性を加味した最終倍率 */
export function abilityAdjusted(ability: string | null | undefined, atkType: string, eff: number): number {
  if (!ability) return eff
  if (ability === 'wonder-guard') return eff > 1 ? eff : 0
  const m = ABILITY_TYPE_MOD[ability]?.[atkType]
  return m === undefined ? eff : eff * m
}

/** この特性が atkType の技を無効/半減にするか（注意喚起用） */
export function abilityBlocks(ability: string, atkType: string): 'none' | 'half' | 'immune' {
  const m = ability === 'wonder-guard' ? 0 : ABILITY_TYPE_MOD[ability]?.[atkType]
  return m === undefined ? 'none' : m === 0 ? 'immune' : 'half'
}

export function effectiveness(data: GameData, atkType: string, defTypes: string[]): number {
  const row = data.types.chart[atkType]
  if (!row) return 1
  return defTypes.reduce((m, t) => m * (row[t] ?? 1), 1)
}

export function effLabel(e: number): string {
  if (e === 0) return '無効'
  if (e >= 4) return 'ばつぐん×4'
  if (e >= 2) return 'ばつぐん×2'
  if (e <= 0.25) return 'いまひとつ×0.25'
  if (e < 1) return 'いまひとつ×0.5'
  return '等倍'
}

/** 相手が防御するときのタイプ（テラスタルすると、そのタイプ単独になる。ステラは変わらない） */
export function enemyDefTypes(enemy: Enemy, p: PokemonData): string[] {
  return enemy.tera && enemy.tera !== 'stellar' ? [enemy.tera] : p.types
}

/** 相手のタイプ一致技のタイプ（テラスタルしても元のタイプの一致は残る） */
export function enemyAtkTypes(enemy: Enemy, p: PokemonData): string[] {
  const set = new Set(p.types)
  if (enemy.tera && enemy.tera !== 'stellar') set.add(enemy.tera)
  return [...set]
}

// ---- 実数値（素早さ比較用） ----
function natureMult(name: string, stat: 'spe'): number {
  const n = NATURES.find((x) => x.name === name)
  if (!n) return 1
  return n.up === stat ? 1.1 : n.down === stat ? 0.9 : 1
}
function speedStat(base: number, level: number, iv: number, ev: number, nat: number): number {
  return Math.floor((Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5) * nat)
}

export interface MoveEval {
  move: MoveData
  eff: number
  stab: boolean
  /** 威力が不定の技（仮に60で計算） */
  powerGuess: boolean
  score: number
}

export interface SpeedEval {
  mine: number
  enemyMin: number
  enemyMax: number
  verdict: 'faster' | 'slower' | 'unclear'
  /** 敵Lvが不明で、自分のLvと同じと仮定したとき true */
  assumedLevel: boolean
}

export interface MonEval {
  mon: OwnedPokemon
  species: PokemonData
  inParty: boolean
  moves: MoveEval[]
  best: MoveEval | null
  /** 相手のタイプ一致技を受けたときの最悪倍率 */
  defenseWorst: number
  /** 最悪倍率になる相手の技タイプ */
  worstTypes: string[]
  speed: SpeedEval
  /** 自分の先制技（有効打になるもの） */
  priorityMove: MoveEval | null
  total: number
}

export function evaluateMon(
  data: GameData, enemy: Enemy, enemyP: PokemonData, mon: OwnedPokemon, inParty: boolean,
): MonEval | null {
  const species = data.pokemonBySlug.get(mon.slug)
  if (!species) return null
  const defTypes = enemyDefTypes(enemy, enemyP)

  const moves: MoveEval[] = []
  for (const id of mon.moves) {
    const move = id != null ? data.moves.get(id) : undefined
    if (!move || move.class === 'status') continue
    const raw = effectiveness(data, move.type, defTypes)
    const eff = abilityAdjusted(enemy.ability, move.type, raw)
    const stab = species.types.includes(move.type)
    const powerGuess = move.power == null
    const score = (move.power ?? 60) * eff * (stab ? 1.5 : 1) * ((move.accuracy ?? 100) / 100)
    moves.push({ move, eff, stab, powerGuess, score })
  }
  moves.sort((a, b) => b.score - a.score)
  const best = moves[0] && moves[0].eff > 0 ? moves[0] : null

  // 受け: 相手のタイプ一致技のうち最悪のもの
  let defenseWorst = 0
  let worstTypes: string[] = []
  for (const t of enemyAtkTypes(enemy, enemyP)) {
    const m = abilityAdjusted(mon.ability, t, effectiveness(data, t, species.types))
    if (m > defenseWorst) { defenseWorst = m; worstTypes = [t] }
    else if (m === defenseWorst) worstTypes.push(t)
  }

  // 素早さ
  const level = enemy.level ?? mon.level
  const mine = speedStat(species.stats.spe, mon.level, mon.ivs.spe, mon.evs.spe, natureMult(mon.nature, 'spe'))
  const enemyMin = speedStat(enemyP.stats.spe, level, 0, 0, 0.9)
  const enemyMax = speedStat(enemyP.stats.spe, level, 31, 252, 1.1)
  const verdict = mine > enemyMax ? 'faster' : mine < enemyMin ? 'slower' : 'unclear'
  const speed: SpeedEval = { mine, enemyMin, enemyMax, verdict, assumedLevel: enemy.level == null }

  const priorityMove = moves.find((m) => m.move.priority > 0 && m.eff > 0) ?? null

  const defFactor =
    defenseWorst === 0 ? 1.3 : defenseWorst <= 0.25 ? 1.25 : defenseWorst <= 0.5 ? 1.15
    : defenseWorst <= 1 ? 1 : defenseWorst <= 2 ? 0.75 : 0.5
  const speedFactor = verdict === 'faster' ? 1.1 : verdict === 'slower' ? 0.95 : 1
  const total = best ? best.score * defFactor * speedFactor : 0

  return { mon, species, inParty, moves, best, defenseWorst, worstTypes, speed, priorityMove, total }
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
}

const typeName = (data: GameData, slug: string) => data.types.types.find((t) => t.slug === slug)?.name ?? slug
const typeList = (data: GameData, slugs: string[]) => slugs.map((t) => typeName(data, t)).join('・')
export const monName = (mon: OwnedPokemon, data: GameData) => {
  const base = data.pokemonBySlug.get(mon.slug)?.name ?? mon.slug
  return mon.nickname ? `${mon.nickname}（${base}）` : base
}

export function advise(
  data: GameData,
  enemy: Enemy,
  mons: { mon: OwnedPokemon; inParty: boolean }[],
  tera: boolean,
): Advice | null {
  const enemyP = data.pokemonBySlug.get(enemy.slug)
  if (!enemyP) return null

  const ranking = mons
    .map((m) => evaluateMon(data, enemy, enemyP, m.mon, m.inParty))
    .filter((x): x is MonEval => x !== null)
    .sort((a, b) => b.total - a.total || Number(b.inParty) - Number(a.inParty))

  const pick = ranking[0] && ranking[0].total > 0 ? ranking[0] : null
  const eTypes = enemyDefTypes(enemy, enemyP)
  const eAtk = enemyAtkTypes(enemy, enemyP)
  const abName = (slug: string) => data.abilities.get(slug)?.name ?? slug
  const attack: string[] = []
  const defense: string[] = []
  const speed: string[] = []
  const cautions: string[] = []
  let headline: string
  const tmIdeas: TmSuggestion[] = []

  if (ranking.length === 0) {
    return {
      enemy: enemyP, ranking, pick: null, attack, defense, speed, cautions, tmIdeas,
      headline: '手持ちが登録されていません。「手持ち」タブでポケモンと技を登録してください。',
    }
  }

  // --- 攻撃 ---
  if (pick && pick.best) {
    const b = pick.best
    headline = `${monName(pick.mon, data)}を出して、「${b.move.name}」で攻撃（${effLabel(b.eff)}）`
    attack.push(
      `${monName(pick.mon, data)}の「${b.move.name}」で攻める。${effLabel(b.eff)}` +
        `${b.stab ? '・タイプ一致' : ''}・威力${b.move.power ?? '不定'}。`,
    )
    for (const m of pick.moves.slice(1, 3))
      if (m.eff > 0) attack.push(`次点: 「${m.move.name}」（${effLabel(m.eff)}${m.stab ? '・タイプ一致' : ''}）。`)
    const noGood = pick.moves.filter((m) => m.eff > 0 && m.eff < 1)
    if (noGood.length) attack.push(`「${noGood.map((m) => m.move.name).join('」「')}」は効きにくいので使わない。`)
    const zero = pick.moves.filter((m) => m.eff === 0)
    if (zero.length) attack.push(`「${zero.map((m) => m.move.name).join('」「')}」は無効。使わない。`)
    if (b.powerGuess) attack.push('※威力が不定の技のため、威力60として計算しています。')

    for (const other of ranking.slice(1, 3))
      if (other.best && other.total > 0)
        attack.push(`控え候補: ${monName(other.mon, data)}（「${other.best.move.name}」${effLabel(other.best.eff)}）。`)
  } else {
    headline = '有効な技を持つ手持ちがいません。技構成の見直しか、別のポケモンの登録を検討してください。'
    attack.push('どの手持ちの技も相手に通りません（無効、または攻撃技が未設定）。')
  }

  // --- 技マシン提案（選出ポケモンが、有効な技を技マシンで覚えられる場合） ---
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
    tmIdeas.sort(
      (a, b) =>
        b.eff * (b.move.power ?? 0) * (target.species.types.includes(b.move.type) ? 1.5 : 1) -
        a.eff * (a.move.power ?? 0) * (target.species.types.includes(a.move.type) ? 1.5 : 1),
    )
    tmIdeas.length = Math.min(tmIdeas.length, 3)
  }

  // --- 受け ---
  const sorted = [...ranking].sort((a, b) => a.defenseWorst - b.defenseWorst)
  const safe = sorted.filter((m) => m.defenseWorst <= 0.5)
  const danger = sorted.filter((m) => m.defenseWorst >= 2).reverse()
  defense.push(`相手のタイプ一致技は ${typeList(data, eAtk)} と想定（実際の技は不明）。`)
  if (safe.length)
    defense.push(
      `受け出し向き: ${safe.slice(0, 3).map((m) => `${monName(m.mon, data)}（${effLabel(m.defenseWorst)}）`).join('、')}。`,
    )
  else defense.push('相手のタイプ一致技を半減以下で受けられる手持ちはいません。')
  if (danger.length)
    defense.push(
      `繰り出しを避ける: ${danger.slice(0, 3).map((m) => `${monName(m.mon, data)}（${typeList(data, m.worstTypes)}技に${effLabel(m.defenseWorst)}）`).join('、')}。`,
    )
  if (pick && pick.defenseWorst >= 2)
    defense.push(`${monName(pick.mon, data)}は弱点を突かれる。先に倒すか、倒されたら交代する想定で。`)

  // --- 素早さ ---
  if (pick) {
    const s = pick.speed
    const range = `${s.enemyMin}〜${s.enemyMax}`
    const lvNote = s.assumedLevel ? '（相手Lv不明のため、自分と同Lvと仮定）' : ''
    if (s.verdict === 'faster')
      speed.push(`${monName(pick.mon, data)}（素早さ${s.mine}）は相手（推定${range}）より確実に先手。先に攻撃できる。${lvNote}`)
    else if (s.verdict === 'slower') {
      speed.push(`${monName(pick.mon, data)}（素早さ${s.mine}）は相手（推定${range}）より後手。1発耐えられるかを意識する。${lvNote}`)
      if (pick.priorityMove)
        speed.push(`先制技「${pick.priorityMove.move.name}」で先手を取れる。`)
      else {
        const faster = ranking.find((m) => m.total > 0 && m.speed.verdict === 'faster' && m !== pick)
        if (faster) speed.push(`先手を取りたいなら ${monName(faster.mon, data)} が候補。`)
      }
    } else {
      speed.push(`${monName(pick.mon, data)}（素早さ${s.mine}）と相手（推定${range}）は同程度。先手は相手の個体次第。${lvNote}`)
      if (pick.priorityMove) speed.push(`先制技「${pick.priorityMove.move.name}」なら確実に先手。`)
    }
  } else speed.push('選出が決まらないため、素早さの比較はできません。')

  // --- 注意点 ---
  if (enemy.tera) {
    if (enemy.tera === 'stellar')
      cautions.push('相手はステラテラスタル。タイプは変わらず、技の威力が上がる。')
    else
      cautions.push(
        `相手はテラスタル（${typeName(data, enemy.tera)}）。弱点・耐性が${typeName(data, enemy.tera)}タイプ基準に変わる。元のタイプ一致技（${typeList(data, enemyP.types)}）にも注意。`,
      )
  } else if (tera) {
    cautions.push('相手がテラスタルすると弱点が変わる。テラスタイプが分かれば入力してください。')
  }
  if (pick && pick.best) {
    if (enemy.ability) {
      const blocks = abilityBlocks(enemy.ability, pick.best.move.type)
      if (blocks !== 'none') cautions.push(`相手の特性「${abName(enemy.ability)}」の影響を受ける技です（計算には反映済み）。`)
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
    if (diff >= 5) cautions.push(`相手のLvが${diff}高い。1発で倒されることもあるので、慎重に。`)
    else if (diff <= -10) cautions.push(`相手のLvが${-diff}低い。技が効きにくくても押し切れる可能性がある。`)
  }
  if (!enemy.ability && enemyP.abilities.length > 1)
    cautions.push(`相手の特性候補: ${enemyP.abilities.map((a) => abName(a.slug)).join('、')}。`)

  return { enemy: enemyP, ranking, pick, headline, attack, defense, speed, cautions, tmIdeas }
}
