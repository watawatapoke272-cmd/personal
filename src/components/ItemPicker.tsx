import { useMemo, useState } from 'react'
import { norm } from '../text'
import type { GameData } from '../types'

interface Props {
  data: GameData
  current: string
  onPick: (name: string) => void
  onCancel: () => void
}

export function ItemPicker({ data, current, onPick, onCancel }: Props) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const key = norm(q)
    return data.items.filter((i) => !key || norm(i.name).includes(key))
  }, [data, q])
  // 一覧に無い名前を、これまでに自由入力で入れていた場合
  const legacy = current && !data.itemByName.has(current)

  return (
    <div className="sheet-inner">
      <div className="sheet-bar">
        <strong>持ち物を選ぶ</strong>
        <button onClick={onCancel}>閉じる</button>
      </div>
      <input autoFocus className="search" placeholder="持ち物名で検索（ひらがなOK）" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="ghost" onClick={() => onPick('')}>持ち物なしにする</button>
      {legacy && <div className="muted">現在の入力「{current}」は一覧にありません（そのままでも使えます）。</div>}
      <div className="muted">{list.length}件</div>
      <ul className="pick-list">
        {list.map((i) => (
          <li key={i.slug}>
            <button onClick={() => onPick(i.name)}>
              <span className="pick-name">{i.name}{i.name === current && <small>（選択中）</small>}</span>
              {i.text && <span className="how">{i.text}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
