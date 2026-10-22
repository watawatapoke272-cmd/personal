import { useMemo, useRef, useState } from 'react'
import { norm } from '../text'
import { PARTY_MAX, sanitizeSave } from '../storage'
import type { SaveApi } from '../storage'
import type { GameData, GameId } from '../types'
import { MonCard, monTitle } from './MonCard'
import { MonEditor } from './MonEditor'
import { PartyWeakness } from './PartyWeakness'
import { SyncPanel } from './SyncPanel'
import type { SyncApi } from '../sync'

interface Props {
  game: GameId
  data: GameData
  api: SaveApi
  sync: SyncApi
}

type Editing = { id: string | null; place: 'party' | 'box' } | null

export function MonsView({ game, data, api, sync }: Props) {
  const { save } = api
  const [editing, setEditing] = useState<Editing>(null)
  const [q, setQ] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const party = save.party.map((id) => save.mons[id]).filter(Boolean)
  const box = useMemo(() => {
    const key = norm(q)
    return Object.values(save.mons)
      .filter((m) => !save.party.includes(m.id))
      .filter((m) => !key || norm(monTitle(m, data)).includes(key))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [save, q, data])
  const boxTotal = Object.keys(save.mons).length - party.length

  const current = editing?.id ? save.mons[editing.id] : null

  function exportJson() {
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pokemon-${game}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  async function importJson(file: File) {
    try {
      const incoming = sanitizeSave(JSON.parse(await file.text()))
      const n = Object.keys(incoming.mons).length
      if (n === 0) return setNotice('読み込めるポケモンが見つかりませんでした。')
      if (!window.confirm(`${n}匹を読み込みます。現在の手持ち（${Object.keys(save.mons).length}匹）は置き換えられます。よろしいですか？`)) return
      api.replaceAll(incoming)
      setNotice(`${n}匹を読み込みました。`)
    } catch {
      setNotice('ファイルを読み込めませんでした（JSON形式ではありません）。')
    }
  }

  return (
    <div className="view">
      {api.storageError && (
        <div className="banner warn">
          この端末に保存できません（ブラウザの保存が無効、または容量不足）。書き出しでバックアップしてください。
        </div>
      )}

      <h2>パーティ <small>{party.length}/{PARTY_MAX}</small></h2>
      <div className="grid-cards">
        {party.map((m, i) => (
          <MonCard
            key={m.id} mon={m} data={data} game={game} index={i}
            onOpen={() => setEditing({ id: m.id, place: 'party' })}
            onMove={(dir) => api.reorderParty(m.id, dir)}
          />
        ))}
        {party.length < PARTY_MAX && (
          <button className="card add" onClick={() => setEditing({ id: null, place: 'party' })}>
            ＋ パーティに追加
          </button>
        )}
      </div>

      <PartyWeakness data={data} game={game} party={party} />

      <h2>ボックス <small>{boxTotal}匹</small></h2>
      <div className="row">
        <input
          className="search" placeholder="ボックス内を検索"
          value={q} onChange={(e) => setQ(e.target.value)}
        />
        <button className="primary" onClick={() => setEditing({ id: null, place: 'box' })}>＋ 追加</button>
      </div>
      <div className="grid-cards">
        {box.map((m) => (
          <div key={m.id} className="boxed">
            <MonCard mon={m} data={data} game={game} onOpen={() => setEditing({ id: m.id, place: 'box' })} />
            <button
              className="ghost small"
              disabled={party.length >= PARTY_MAX}
              onClick={() => api.moveTo(m.id, 'party')}
            >
              パーティに入れる
            </button>
          </div>
        ))}
        {box.length === 0 && (
          <p className="muted">{boxTotal === 0 ? 'まだ登録がありません。「＋ 追加」から登録します。' : '該当なし'}</p>
        )}
      </div>

      <h2>同期・バックアップ</h2>
      <SyncPanel sync={sync} />
      <h3 className="sub">ファイルでバックアップ</h3>
      <div className="row">
        <button onClick={exportJson} disabled={Object.keys(save.mons).length === 0}>書き出し（JSON）</button>
        <button onClick={() => fileRef.current?.click()}>読み込み</button>
        <input
          ref={fileRef} type="file" accept="application/json,.json" hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) void importJson(f)
          }}
        />
      </div>
      {notice && <p className="muted">{notice}</p>}

      {editing && (
        <div className="sheet" role="dialog" aria-modal="true">
          <MonEditor
            key={editing.id ?? 'new'}
            game={game}
            data={data}
            initial={current}
            initialPlace={editing.place === 'party' && party.length >= PARTY_MAX ? 'box' : editing.place}
            inParty={!!editing.id && save.party.includes(editing.id)}
            partyCount={party.length}
            onClose={() => setEditing(null)}
            onSave={(mon, place) => {
              api.upsert(mon)
              api.moveTo(mon.id, place)
              setEditing(null)
            }}
            onDelete={
              editing.id
                ? () => {
                    api.remove(editing.id!)
                    setEditing(null)
                  }
                : undefined
            }
          />
        </div>
      )}
    </div>
  )
}
