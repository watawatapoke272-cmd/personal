import { useState } from 'react'
import { inDex } from '../data'
import type { WishApi } from '../wishlist'
import type { GameData } from '../types'
import { TypeChip } from './Chips'
import { PokemonPicker } from './PokemonPicker'
import { Sprite } from './Sprite'

interface Props {
  data: GameData
  wish: WishApi
  /** 図鑑のポケモン詳細を開く */
  onOpenDex: (slug: string) => void
  /** すでに持っているポケモン（slug） */
  ownedSlugs: Set<string>
}

/** どこで入手できるか（図鑑の載り方から） */
function where(p: { dex: Record<string, number> }): string {
  if (p.dex.paldea !== undefined) return '本編'
  if (p.dex.kitakami !== undefined) return '碧の仮面'
  if (p.dex.blueberry !== undefined) return '藍の円盤'
  return '図鑑外（HOME等）'
}

export function WishList({ data, wish, onOpenDex, ownedSlugs }: Props) {
  const [picking, setPicking] = useState(false)
  const todo = wish.list.filter((w) => !w.done)
  const done = wish.list.filter((w) => w.done)

  if (picking)
    return (
      <div className="sheet" role="dialog" aria-modal="true">
        <PokemonPicker
          data={data}
          onCancel={() => setPicking(false)}
          onPick={(p) => {
            wish.add(p.slug)
            setPicking(false)
          }}
        />
      </div>
    )

  return (
    <>
      <h2>ほしいポケモン <small>{todo.length}匹</small></h2>
      {wish.storageError && <div className="banner warn">この端末に保存できません（ブラウザの保存が無効、または容量不足）。</div>}
      <div className="row">
        <button className="primary" onClick={() => setPicking(true)}>＋ 追加</button>
      </div>
      <ul className="raid-list">
        {todo.map((w) => <Item key={w.id} w={w} data={data} wish={wish} onOpenDex={onOpenDex} owned={ownedSlugs.has(w.slug)} />)}
      </ul>
      {todo.length === 0 && <p className="muted">ほしいポケモンを「＋ 追加」で登録できます。育成論やボス図鑑の「☆ ほしいリストに入れる」からも追加できます。</p>}
      {done.length > 0 && (
        <details>
          <summary>ゲット済み（{done.length}）</summary>
          <ul className="raid-list">
            {done.map((w) => <Item key={w.id} w={w} data={data} wish={wish} onOpenDex={onOpenDex} owned={ownedSlugs.has(w.slug)} />)}
          </ul>
        </details>
      )}
      <small>この端末だけに保存されます（他の端末とは同期されません）。</small>
    </>
  )
}

function Item({ w, data, wish, onOpenDex, owned }: {
  w: WishApi['list'][number]; data: GameData; wish: WishApi; onOpenDex: (slug: string) => void; owned: boolean
}) {
  const p = data.pokemonBySlug.get(w.slug)
  if (!p) return null
  return (
    <li className="card wish">
      <Sprite id={p.id} size={48} />
      <div className="wish-body">
        <div>
          <span className="pick-name">{p.name}</span>
          {p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}
          <small>{inDex(p) ? where(p) : '図鑑外（HOME等）'}</small>
          {owned && !w.done && <small>すでに持っています</small>}
        </div>
        <textarea
          className="wish-memo" rows={2} placeholder="メモ（どこで入手／育成の予定など）"
          value={w.memo} onChange={(e) => wish.update(w.id, { memo: e.target.value })}
        />
        <div className="row">
          <label className="check">
            <input type="checkbox" checked={w.done} onChange={(e) => wish.update(w.id, { done: e.target.checked })} />
            ゲット済み
          </label>
          <button className="ghost small" onClick={() => onOpenDex(w.slug)}>図鑑で見る</button>
          <button
            className="ghost small"
            onClick={() => { if (window.confirm(`${p.name}をほしいリストから消しますか？`)) wish.remove(w.id) }}
          >
            削除
          </button>
        </div>
      </div>
    </li>
  )
}
