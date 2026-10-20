import { useMemo, useState } from 'react'
import { inDex } from '../data'
import { norm } from '../text'
import type { GameData, PokemonData } from '../types'
import { TypeChip } from './Chips'

interface Props {
  data: GameData
  onPick: (p: PokemonData) => void
  onCancel: () => void
}

/** 図鑑番号の最小値（ソフトの図鑑にいない個体は末尾へ） */
const dexOrder = (p: PokemonData) => Math.min(...Object.values(p.dex), 9999)

export function PokemonPicker({ data, onPick, onCancel }: Props) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)

  const list = useMemo(() => {
    const key = norm(q)
    return data.pokemon
      .filter((p) => (all || inDex(p)) && (!key || norm(p.name).includes(key)))
      .sort((a, b) => dexOrder(a) - dexOrder(b) || a.id - b.id)
  }, [data, q, all])

  return (
    <div className="sheet-inner">
      <div className="sheet-bar">
        <strong>ポケモンを選ぶ</strong>
        <button onClick={onCancel}>閉じる</button>
      </div>
      <input
        autoFocus
        className="search"
        placeholder="名前で検索（ひらがなOK）"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <label className="check">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        図鑑にいない個体も表示（HOME連携のみ・伝説など）
      </label>
      <div className="muted">{list.length}件{list.length > 60 && '（先頭60件を表示）'}</div>
      <ul className="pick-list">
        {list.slice(0, 60).map((p) => (
          <li key={p.slug}>
            <button onClick={() => onPick(p)}>
              <span className="pick-name">{p.name}</span>
              <span>{p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
