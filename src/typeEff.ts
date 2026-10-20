// タイプ相性と、特性による補正（battle.ts と calc.ts で共有）
import type { GameData } from './types.ts'

/** 特性による、特定タイプの技への倍率補正（0=無効, 0.5=半減） */
export const ABILITY_TYPE_MOD: Record<string, Record<string, number>> = {
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

