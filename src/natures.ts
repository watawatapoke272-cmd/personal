import type { StatKey } from './types'

export const STAT_LABEL: Record<StatKey, string> = {
  hp: 'HP', atk: 'こうげき', def: 'ぼうぎょ', spa: 'とくこう', spd: 'とくぼう', spe: 'すばやさ',
}
export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

type Up = StatKey | null
export interface Nature { name: string; up: Up; down: Up }

const N = (name: string, up: Up, down: Up): Nature => ({ name, up, down })

export const NATURES: Nature[] = [
  N('がんばりや', null, null), N('さみしがり', 'atk', 'def'), N('ゆうかん', 'atk', 'spe'),
  N('いじっぱり', 'atk', 'spa'), N('やんちゃ', 'atk', 'spd'),
  N('ずぶとい', 'def', 'atk'), N('すなお', null, null), N('のんき', 'def', 'spe'),
  N('わんぱく', 'def', 'spa'), N('のうてんき', 'def', 'spd'),
  N('おくびょう', 'spe', 'atk'), N('せっかち', 'spe', 'def'), N('まじめ', null, null),
  N('ようき', 'spe', 'spa'), N('むじゃき', 'spe', 'spd'),
  N('ひかえめ', 'spa', 'atk'), N('おっとり', 'spa', 'def'), N('れいせい', 'spa', 'spe'),
  N('てれや', null, null), N('うっかりや', 'spa', 'spd'),
  N('おだやか', 'spd', 'atk'), N('おとなしい', 'spd', 'def'), N('なまいき', 'spd', 'spe'),
  N('しんちょう', 'spd', 'spa'), N('きまぐれ', null, null),
]

const SHORT: Record<StatKey, string> = { hp: 'HP', atk: '攻', def: '防', spa: '特攻', spd: '特防', spe: '素' }

export function natureLabel(n: Nature): string {
  return n.up && n.down ? `${n.name}（${SHORT[n.up]}↑ ${SHORT[n.down]}↓）` : `${n.name}（無補正）`
}
