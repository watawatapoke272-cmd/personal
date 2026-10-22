import { useState } from 'react'
import { GAMES } from '../data'
import { NATURES, STAT_KEYS, STAT_LABEL, natureLabel } from '../natures'
import { PARTY_MAX, newMon } from '../storage'
import type { GameData, GameId, OwnedPokemon, PokemonData, StatKey } from '../types'
import { MoveClass, TypeChip } from './Chips'
import { IntInput } from './IntInput'
import { ItemPicker } from './ItemPicker'
import { learnableMoves, MovePicker } from './MovePicker'
import { PokemonPicker } from './PokemonPicker'

interface Props {
  game: GameId
  data: GameData
  /** 編集対象。null なら新規 */
  initial: OwnedPokemon | null
  /** 新規のとき、最初の配置先 */
  initialPlace: 'party' | 'box'
  inParty: boolean
  partyCount: number
  onSave: (mon: OwnedPokemon, place: 'party' | 'box') => void
  onDelete?: () => void
  onClose: () => void
}

type Sub = { kind: 'species' } | { kind: 'move'; slot: number } | { kind: 'item' } | null


export function MonEditor({
  game, data, initial, initialPlace, inParty, partyCount, onSave, onDelete, onClose,
}: Props) {
  const [mon, setMon] = useState<OwnedPokemon | null>(initial)
  const [place, setPlace] = useState<'party' | 'box'>(initial ? (inParty ? 'party' : 'box') : initialPlace)
  const [sub, setSub] = useState<Sub>(initial ? null : { kind: 'species' })

  const species: PokemonData | undefined = mon ? data.pokemonBySlug.get(mon.slug) : undefined
  const partyFull = partyCount >= PARTY_MAX && !inParty

  function pickSpecies(p: PokemonData) {
    const firstAbility = p.abilities.find((a) => !a.hidden)?.slug ?? p.abilities[0]?.slug ?? ''
    if (!mon) {
      setMon(newMon(p.slug, firstAbility))
    } else {
      // 種類を変えたら、覚えられない技と使えない特性は外す
      const learn = new Set(learnableMoves(p, data).map((l) => l.move.id))
      setMon({
        ...mon,
        slug: p.slug,
        ability: p.abilities.some((a) => a.slug === mon.ability) ? mon.ability : firstAbility,
        moves: mon.moves.map((m) => (m != null && learn.has(m) ? m : null)),
      })
    }
    setSub(null)
  }

  function patch(p: Partial<OwnedPokemon>) {
    setMon((m) => (m ? { ...m, ...p } : m))
  }
  function setStat(kind: 'evs' | 'ivs', k: StatKey, v: number) {
    if (!mon) return
    patch({ [kind]: { ...mon[kind], [k]: v } })
  }

  // ---- サブ画面（ポケモン選択 / 技選択） ----
  if (sub?.kind === 'species')
    return (
      <PokemonPicker
        data={data}
        onPick={pickSpecies}
        onCancel={() => {
          setSub(null)
          if (!mon) onClose()
        }}
      />
    )
  if (sub?.kind === 'item' && mon)
    return (
      <ItemPicker
        data={data}
        current={mon.item}
        onPick={(name) => {
          patch({ item: name })
          setSub(null)
        }}
        onCancel={() => setSub(null)}
      />
    )
  if (sub?.kind === 'move' && species && mon)
    return (
      <MovePicker
        data={data}
        mon={species}
        taken={mon.moves.filter((_, i) => i !== sub.slot)}
        onPick={(id) => {
          const moves = [...mon.moves]
          moves[sub.slot] = id
          patch({ moves })
          setSub(null)
        }}
        onCancel={() => setSub(null)}
      />
    )

  if (!mon || !species) return null

  const evTotal = STAT_KEYS.reduce((s, k) => s + mon.evs[k], 0)
  const hasTera = GAMES[game].hasTera
  const natureNow = NATURES.find((n) => n.name === mon.nature)

  return (
    <div className="sheet-inner editor">
      <div className="sheet-bar">
        <strong>{initial ? '手持ちを編集' : '手持ちを追加'}</strong>
        <button onClick={onClose}>キャンセル</button>
      </div>

      <section>
        <button className="species-btn" onClick={() => setSub({ kind: 'species' })}>
          <span className="pick-name">{species.name}</span>
          <span>{species.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}</span>
          <small>変更</small>
        </button>
        <div className="base-stats">
          {STAT_KEYS.map((k) => (
            <span key={k}>
              {STAT_LABEL[k]} <b>{species.stats[k]}</b>
            </span>
          ))}
        </div>
      </section>

      <section className="grid2">
        <label>
          ニックネーム
          <input value={mon.nickname} maxLength={12} onChange={(e) => patch({ nickname: e.target.value })} />
        </label>
        <label>
          レベル
          <IntInput value={mon.level} min={1} max={100} onChange={(level) => patch({ level })} />
        </label>
        <label>
          特性
          <select value={mon.ability} onChange={(e) => patch({ ability: e.target.value })}>
            {species.abilities.map((a) => (
              <option key={a.slug} value={a.slug}>
                {data.abilities.get(a.slug)?.name ?? a.slug}
                {a.hidden ? '（夢特性）' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          持ち物
          <button className="select-like" onClick={() => setSub({ kind: 'item' })}>
            {mon.item || <span className="muted">未設定（タップして選ぶ）</span>}
          </button>
        </div>
        {hasTera && (
          <label>
            テラスタイプ
            <select value={mon.teraType} onChange={(e) => patch({ teraType: e.target.value })}>
              <option value="">未設定</option>
              {data.types.types.map((t) => (
                <option key={t.slug} value={t.slug}>{t.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          性格
          <select value={mon.nature} onChange={(e) => patch({ nature: e.target.value })}>
            {NATURES.map((n) => (
              <option key={n.name} value={n.name}>{natureLabel(n)}</option>
            ))}
          </select>
        </label>
      </section>
      {natureNow && natureNow.up && (
        <div className="muted">
          {STAT_LABEL[natureNow.up]}が上がり、{STAT_LABEL[natureNow.down!]}が下がる
        </div>
      )}

      <section>
        <h3>技</h3>
        <ul className="move-slots">
          {mon.moves.map((id, i) => {
            const m = id != null ? data.moves.get(id) : undefined
            return (
              <li key={i}>
                <button onClick={() => setSub({ kind: 'move', slot: i })}>
                  {m ? (
                    <>
                      <span className="pick-name">{m.name}</span>
                      <span className="move-meta">
                        <TypeChip data={data} slug={m.type} />
                        <MoveClass cls={m.class} />
                        <span className="power">{m.power ?? '―'}</span>
                      </span>
                    </>
                  ) : (
                    <span className="muted">技{i + 1}を選ぶ</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h3>
          努力値 / 個体値 <small className={evTotal > 510 ? 'warn' : 'muted'}>努力値合計 {evTotal}/510</small>
        </h3>
        <table className="ev-table">
          <thead>
            <tr><th></th><th>努力値(0-252)</th><th>個体値(0-31)</th></tr>
          </thead>
          <tbody>
            {STAT_KEYS.map((k) => (
              <tr key={k}>
                <th>{STAT_LABEL[k]}</th>
                <td>
                  <IntInput value={mon.evs[k]} min={0} max={252} onChange={(v) => setStat('evs', k, v)} />
                </td>
                <td>
                  <IntInput value={mon.ivs[k]} min={0} max={31} onChange={(v) => setStat('ivs', k, v)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <label>
          メモ
          <textarea rows={3} value={mon.memo} onChange={(e) => patch({ memo: e.target.value })} />
        </label>
      </section>

      <section>
        <h3>置き場所</h3>
        <div className="seg">
          <button className={place === 'party' ? 'on' : ''} disabled={partyFull} onClick={() => setPlace('party')}>
            パーティ{partyFull && '（満員）'}
          </button>
          <button className={place === 'box' ? 'on' : ''} onClick={() => setPlace('box')}>ボックス</button>
        </div>
      </section>

      <div className="actions">
        <button className="primary" onClick={() => onSave(mon, place)}>保存</button>
        {onDelete && (
          <button
            className="danger"
            onClick={() => {
              if (window.confirm('この手持ちを削除します。元に戻せません。よろしいですか？')) onDelete()
            }}
          >
            削除
          </button>
        )}
      </div>
    </div>
  )
}
