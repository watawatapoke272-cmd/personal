import { useMemo, useState } from 'react'
import { dexOrder, learnersOf } from '../dexIndex'
import { inDex } from '../data'
import { norm } from '../text'
import type { GameData, GameId, OwnedPokemon } from '../types'
import { MoveClass, TypeChip } from './Chips'
import { MachineDetail, MoveDetail, PokemonDetail } from './DexDetails'
import type { Overlay } from './DexDetails'
import { sourceSummary } from './MachineSourceBlock'
import type { WishApi } from '../wishlist'

interface Props {
  game: GameId
  data: GameData
  owned: OwnedPokemon[]
  wish: WishApi
  /** 他の画面から、このポケモンの詳細を開いた状態で始める */
  initialSlug?: string
  /** 他の画面から開いたとき、最初の詳細で「戻る」を押したときの動作 */
  onExit?: () => void
}

type Sub = 'tm' | 'pokemon' | 'move'
const SUBS: { id: Sub; label: string }[] = [
  { id: 'tm', label: '技マシン' },
  { id: 'pokemon', label: 'ポケモン' },
  { id: 'move', label: '技' },
]

export function DexView({ game, data, owned, wish, initialSlug, onExit }: Props) {
  const [sub, setSub] = useState<Sub>(initialSlug ? 'pokemon' : 'tm')
  const [stack, setStack] = useState<Overlay[]>(initialSlug ? [{ kind: 'pokemon', slug: initialSlug }] : [])
  const open = (o: Overlay) => setStack((s) => [...s, o])
  // 他の画面から開いたときは、最初の1枚で「戻る」を押すと元の画面に戻る
  const back = () => (stack.length === 1 && onExit ? onExit() : setStack((s) => s.slice(0, -1)))
  const top = stack.at(-1)

  return (
    <div className="view">
      <div className="seg wide" role="group" aria-label="種類">
        {SUBS.map((s) => (
          <button key={s.id} className={s.id === sub ? 'on' : ''} onClick={() => setSub(s.id)}>
            {s.label}
          </button>
        ))}
      </div>

      {sub === 'tm' && <MachineList game={game} data={data} owned={owned} open={open} />}
      {sub === 'pokemon' && <PokemonList data={data} owned={owned} open={open} />}
      {sub === 'move' && <MoveList data={data} owned={owned} open={open} />}

      {top && (
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="sheet-inner">
            <div className="sheet-bar">
              <button onClick={back}>← 戻る</button>
              {stack.length > 1 && <button className="ghost" onClick={() => setStack([])}>閉じる</button>}
            </div>
            {top.kind === 'pokemon' && <PokemonDetail key={top.slug} slug={top.slug} game={game} data={data} owned={owned} open={open} wish={wish} />}
            {top.kind === 'move' && <MoveDetail key={top.id} id={top.id} game={game} data={data} owned={owned} open={open} />}
            {top.kind === 'machine' && <MachineDetail key={top.label} label={top.label} game={game} data={data} owned={owned} open={open} />}
          </div>
        </div>
      )}
    </div>
  )
}

interface ListProps {
  data: GameData
  owned: OwnedPokemon[]
  open: (o: Overlay) => void
}

// ---------- 技マシン一覧 ----------
function MachineList({ game, data, owned, open }: ListProps & { game: GameId }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'tm' | 'tr'>('all')
  const [onlyMine, setOnlyMine] = useState(false)

  // 手持ちが覚えられて、まだ習得していない技マシン → 覚えられる手持ちの名前
  const mineByMove = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const m of data.machines) {
      const ls = learnersOf(data, m.moveId).filter((l) => l.methods.includes('M'))
      const names = owned
        .filter((o) => !o.moves.includes(m.moveId) && ls.some((l) => l.p.slug === o.slug))
        .map((o) => o.nickname || data.pokemonBySlug.get(o.slug)?.name || o.slug)
      if (names.length) map.set(m.moveId, names)
    }
    return map
  }, [data, owned])

  const list = useMemo(() => {
    const key = norm(q)
    return data.machines.filter((m) => {
      if (kind !== 'all' && m.kind !== kind) return false
      if (onlyMine && !mineByMove.has(m.moveId)) return false
      if (!key) return true
      const move = data.moves.get(m.moveId)
      const src = data.machineSources.get(m.label)
      const hay = [
        m.label, move?.name, src?.unlock, src?.area, src?.how,
        ...(src?.materials?.map((x) => x.name) ?? []), ...(src?.places ?? []),
      ].filter(Boolean).join(' ')
      return norm(hay).includes(key)
    })
  }, [data, q, kind, onlyMine, mineByMove])

  return (
    <>
      <input
        className="search" placeholder="番号・技名・素材・場所で検索"
        value={q} onChange={(e) => setQ(e.target.value)}
      />
      <div className="row filters">
        {game === 'swsh' && (
          <select value={kind} onChange={(e) => setKind(e.target.value as 'all' | 'tm' | 'tr')}>
            <option value="all">TMとTR</option>
            <option value="tm">TMのみ</option>
            <option value="tr">TRのみ</option>
          </select>
        )}
        <label className="check inline">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          手持ちが覚えられる（未習得）だけ
        </label>
      </div>
      <div className="muted">{list.length}件</div>
      <div className="lines">
        {list.map((m) => {
          const move = data.moves.get(m.moveId)
          if (!move) return null
          const mine = mineByMove.get(m.moveId)
          const summary = sourceSummary(game, m.label, data.machineSources.get(m.label))
          return (
            <button key={m.label} className="line" onClick={() => open({ kind: 'machine', label: m.label })}>
              <span className="pick-name"><span className="tm-no">{m.label}</span> {move.name}</span>
              <span className="move-meta">
                <TypeChip data={data} slug={move.type} />
                <MoveClass cls={move.class} />
                <span className="power">{move.power ?? '―'}</span>
              </span>
              {summary && <span className="how">{summary}</span>}
              {mine && <span className="how mine">手持ち: {mine.join('、')}</span>}
            </button>
          )
        })}
      </div>
    </>
  )
}

// ---------- ポケモン一覧 ----------
function PokemonList({ data, owned, open }: ListProps) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)
  const ownedSlugs = useMemo(() => new Set(owned.map((o) => o.slug)), [owned])
  const list = useMemo(() => {
    const key = norm(q)
    return data.pokemon
      .filter((p) => (all || inDex(p)) && (!key || norm(p.name).includes(key)))
      .sort((a, b) => dexOrder(a) - dexOrder(b) || a.id - b.id)
  }, [data, q, all])

  return (
    <>
      <input className="search" placeholder="ポケモン名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="check">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        図鑑にいない個体も表示
      </label>
      <div className="muted">{list.length}件{list.length > 80 && '（先頭80件を表示。検索で絞り込めます）'}</div>
      <div className="lines">
        {list.slice(0, 80).map((p) => (
          <button key={p.slug} className="line" onClick={() => open({ kind: 'pokemon', slug: p.slug })}>
            <span className="pick-name">
              {p.name}
              {ownedSlugs.has(p.slug) && <small> ★手持ち</small>}
            </span>
            <span>{p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ---------- 技一覧 ----------
function MoveList({ data, open }: ListProps) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const list = useMemo(() => {
    const key = norm(q)
    return [...data.moves.values()]
      .filter((m) => (!type || m.type === type) && (!key || norm(m.name).includes(key)))
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
  }, [data, q, type])

  return (
    <>
      <input className="search" placeholder="技名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row filters">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">すべてのタイプ</option>
          {data.types.types.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      </div>
      <div className="muted">{list.length}件{list.length > 80 && '（先頭80件を表示。検索で絞り込めます）'}</div>
      <div className="lines">
        {list.slice(0, 80).map((m) => (
          <button key={m.id} className="line" onClick={() => open({ kind: 'move', id: m.id })}>
            <span className="pick-name">
              {m.name}
              {data.machineByMove.has(m.id) && <small> {data.machineByMove.get(m.id)}</small>}
            </span>
            <span className="move-meta">
              <TypeChip data={data} slug={m.type} />
              <MoveClass cls={m.class} />
              <span className="power">{m.power ?? '―'}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
