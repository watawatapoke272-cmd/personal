import { useMemo, useState } from 'react'
import { norm } from '../text'
import type { GameData, LearnEntry, MoveData, PokemonData } from '../types'
import { MoveClass, TypeChip } from './Chips'

export interface LearnableMove {
  move: MoveData
  /** 覚え方の表示（Lv20 / TM045 / タマゴ / 教え技） */
  how: string[]
  /** 並べ替え用: レベル技→技マシン→タマゴ→その他 */
  rank: number
  level: number
}

function describe(e: LearnEntry, data: GameData): { text: string; rank: number; level: number } {
  const [moveId, method, level] = e
  switch (method) {
    case 'L': return { text: `Lv${level ?? 1}`, rank: 0, level: level ?? 1 }
    case 'M': return { text: data.machineByMove.get(moveId) ?? '技マシン', rank: 1, level: 0 }
    case 'E': return { text: 'タマゴ', rank: 2, level: 0 }
    case 'T': return { text: '教え技', rank: 3, level: 0 }
    default: return { text: 'その他', rank: 4, level: 0 }
  }
}

/** そのポケモンが覚えられる技を、覚え方つきで一覧にする */
export function learnableMoves(p: PokemonData, data: GameData): LearnableMove[] {
  const byId = new Map<number, LearnableMove>()
  for (const e of p.moves) {
    const move = data.moves.get(e[0])
    if (!move) continue
    const d = describe(e, data)
    const cur = byId.get(move.id)
    if (!cur) byId.set(move.id, { move, how: [d.text], rank: d.rank, level: d.level })
    else {
      if (!cur.how.includes(d.text)) cur.how.push(d.text)
      if (d.rank < cur.rank || (d.rank === cur.rank && d.level < cur.level)) {
        cur.rank = d.rank
        cur.level = d.level
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) => a.rank - b.rank || a.level - b.level || a.move.name.localeCompare(b.move.name, 'ja'),
  )
}

interface Props {
  data: GameData
  mon: PokemonData
  /** すでに選ばれている技（重複選択を防ぐ） */
  taken: (number | null)[]
  onPick: (moveId: number | null) => void
  onCancel: () => void
}

export function MovePicker({ data, mon, taken, onPick, onCancel }: Props) {
  const [q, setQ] = useState('')
  const all = useMemo(() => learnableMoves(mon, data), [mon, data])
  const list = useMemo(() => {
    const key = norm(q)
    return all.filter((l) => !key || norm(l.move.name).includes(key))
  }, [all, q])

  return (
    <div className="sheet-inner">
      <div className="sheet-bar">
        <strong>技を選ぶ（{mon.name}）</strong>
        <button onClick={onCancel}>閉じる</button>
      </div>
      <input
        autoFocus
        className="search"
        placeholder="技名で検索"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <button className="ghost" onClick={() => onPick(null)}>この枠を空にする</button>
      <div className="muted">{list.length}件</div>
      <ul className="pick-list">
        {list.map((l) => {
          const used = taken.includes(l.move.id)
          return (
            <li key={l.move.id}>
              <button disabled={used} onClick={() => onPick(l.move.id)}>
                <span className="pick-name">
                  {l.move.name}
                  {used && <small>（選択済み）</small>}
                </span>
                <span className="move-meta">
                  <TypeChip data={data} slug={l.move.type} />
                  <MoveClass cls={l.move.class} />
                  <span className="power">{l.move.power ?? '―'}</span>
                </span>
                <span className="how">{l.how.join(' / ')}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
