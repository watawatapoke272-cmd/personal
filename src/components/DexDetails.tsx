import { Sprite } from './Sprite'
import { useMemo } from 'react'
import { dexOrder, learnersOf, METHOD_LABEL } from '../dexIndex'
import { inDex } from '../data'
import { STAT_KEYS, STAT_LABEL } from '../natures'
import type { GameData, GameId, MoveData, OwnedPokemon } from '../types'
import { MoveClass, TypeChip } from './Chips'
import { MachineSourceBlock } from './MachineSourceBlock'

export type Overlay =
  | { kind: 'pokemon'; slug: string }
  | { kind: 'move'; id: number }
  | { kind: 'machine'; label: string }

interface Common {
  game: GameId
  data: GameData
  /** 手持ち（現在のソフト）全員 */
  owned: OwnedPokemon[]
  open: (o: Overlay) => void
}

const ownedName = (m: OwnedPokemon, data: GameData) => m.nickname || data.pokemonBySlug.get(m.slug)?.name || m.slug

function MoveLine({ data, move, open, extra }: { data: GameData; move: MoveData; open: Common['open']; extra?: string }) {
  return (
    <button className="line" onClick={() => open({ kind: 'move', id: move.id })}>
      <span className="pick-name">{move.name}</span>
      <span className="move-meta">
        <TypeChip data={data} slug={move.type} />
        <MoveClass cls={move.class} />
        <span className="power">{move.power ?? '―'}</span>
      </span>
      {extra && <span className="how">{extra}</span>}
    </button>
  )
}

// ---------- ポケモン ----------
export function PokemonDetail({ slug, data, owned, open }: Common & { slug: string }) {
  const p = data.pokemonBySlug.get(slug)
  const groups = useMemo(() => {
    if (!p) return []
    const by = new Map<string, { move: MoveData; level: number }[]>()
    const seen = new Set<string>()
    for (const [id, method, level] of p.moves) {
      const move = data.moves.get(id)
      if (!move || seen.has(`${method}:${id}`)) continue
      seen.add(`${method}:${id}`)
      if (!by.has(method)) by.set(method, [])
      by.get(method)!.push({ move, level: level ?? 0 })
    }
    for (const arr of by.values())
      arr.sort((a, b) => a.level - b.level || a.move.name.localeCompare(b.move.name, 'ja'))
    return ['L', 'M', 'E', 'T', 'F'].filter((m) => by.has(m)).map((m) => ({ method: m, list: by.get(m)! }))
  }, [p, data])
  if (!p) return <p>見つかりません</p>

  const mine = owned.filter((m) => m.slug === slug)
  const total = STAT_KEYS.reduce((s, k) => s + p.stats[k], 0)

  return (
    <div className="detail">
      <h2 className="detail-title"><Sprite id={p.id} size={72} /> {p.name}</h2>
      <div className="mon-types">{p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}</div>
      {!inDex(p) && <p className="muted">このソフトの図鑑には載っていません（HOME連携のみ等）。</p>}
      {mine.length > 0 && <p className="owned-note">手持ち: {mine.map((m) => ownedName(m, data)).join('、')}</p>}

      <h3>種族値（合計 {total}）</h3>
      <div className="stat-bars">
        {STAT_KEYS.map((k) => (
          <div key={k} className="stat-row">
            <span>{STAT_LABEL[k]}</span>
            <b>{p.stats[k]}</b>
            <div className="bar"><div style={{ width: `${Math.min(100, (p.stats[k] / 255) * 100)}%` }} /></div>
          </div>
        ))}
      </div>

      <h3>特性</h3>
      <ul className="plain">
        {p.abilities.map((a) => {
          const ab = data.abilities.get(a.slug)
          return (
            <li key={a.slug}>
              <b>{ab?.name ?? a.slug}</b>{a.hidden && <small>（夢特性）</small>}
              {ab?.text && <div className="muted">{ab.text}</div>}
            </li>
          )
        })}
      </ul>

      {groups.map((g) => (
        <section key={g.method}>
          <h3>覚える技：{METHOD_LABEL[g.method] ?? g.method}（{g.list.length}）</h3>
          <div className="lines">
            {g.list.map(({ move, level }) => {
              const label = g.method === 'M' ? data.machineByMove.get(move.id) : undefined
              return (
                <div key={move.id} className="line-wrap">
                  <MoveLine
                    data={data} move={move} open={open}
                    extra={g.method === 'L' ? `Lv${level}` : label}
                  />
                  {label && (
                    <button className="ghost small" onClick={() => open({ kind: 'machine', label })}>入手</button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// ---------- 技 ----------
export function MoveDetail({ id, data, owned, open }: Common & { id: number }) {
  const move = data.moves.get(id)
  const learners = useMemo(
    () => learnersOf(data, id).slice().sort((a, b) => dexOrder(a.p) - dexOrder(b.p) || a.p.id - b.p.id),
    [data, id],
  )
  if (!move) return <p>見つかりません</p>
  const label = data.machineByMove.get(id)
  const mine = owned.filter((m) => learners.some((l) => l.p.slug === m.slug))
  const known = (slug: string) => owned.some((m) => m.slug === slug && m.moves.includes(id))
  const shown = learners.filter((l) => inDex(l.p))

  return (
    <div className="detail">
      <h2 className="detail-title">{move.name}</h2>
      <div className="move-meta big">
        <TypeChip data={data} slug={move.type} />
        <MoveClass cls={move.class} />
      </div>
      <table className="kv">
        <tbody>
          <tr><th>威力</th><td>{move.power ?? '―'}</td><th>命中</th><td>{move.accuracy ?? '―'}</td></tr>
          <tr><th>PP</th><td>{move.pp ?? '―'}</td><th>優先度</th><td>{move.priority > 0 ? `+${move.priority}` : move.priority}</td></tr>
        </tbody>
      </table>
      {move.text && <p>{move.text}</p>}

      {label && (
        <p>
          <button onClick={() => open({ kind: 'machine', label })}>{label} の入手場所・素材を見る</button>
        </p>
      )}

      {mine.length > 0 && (
        <p className="owned-note">
          手持ちで覚えられる: {mine.map((m) => `${ownedName(m, data)}${m.moves.includes(id) ? '（習得済み）' : ''}`).join('、')}
        </p>
      )}

      <h3>覚えるポケモン（図鑑にいる個体 {shown.length}匹）</h3>
      <div className="lines">
        {shown.map((l) => (
          <button key={l.p.slug} className="line" onClick={() => open({ kind: 'pokemon', slug: l.p.slug })}>
            <span className="pick-name">
              {l.p.name}
              {known(l.p.slug) && <small> ✔習得済み</small>}
            </span>
            <span className="how">{l.methods.map((m) => METHOD_LABEL[m] ?? m).join(' / ')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- 技マシン ----------
export function MachineDetail({ label, game, data, owned, open }: Common & { label: string }) {
  const m = data.machines.find((x) => x.label === label)
  const move = m ? data.moves.get(m.moveId) : undefined
  const learners = useMemo(
    () => (m ? learnersOf(data, m.moveId).filter((l) => l.methods.includes('M')) : []),
    [data, m],
  )
  if (!m || !move) return <p>見つかりません</p>
  const mine = owned.filter((o) => learners.some((l) => l.p.slug === o.slug))

  return (
    <div className="detail">
      <h2 className="detail-title">{label}　{move.name}</h2>
      <div className="move-meta big">
        <TypeChip data={data} slug={move.type} />
        <MoveClass cls={move.class} />
        <span className="power">威力 {move.power ?? '―'} / 命中 {move.accuracy ?? '―'}</span>
      </div>
      {move.text && <p>{move.text}</p>}

      <h3>入手方法</h3>
      <MachineSourceBlock game={game} label={label} src={data.machineSources.get(label)} />

      {mine.length > 0 && (
        <p className="owned-note">
          手持ちで覚えられる: {mine.map((o) => `${ownedName(o, data)}${o.moves.includes(move.id) ? '（習得済み）' : ''}`).join('、')}
        </p>
      )}
      <p>
        <button className="ghost" onClick={() => open({ kind: 'move', id: move.id })}>この技の詳細（レベルで覚えるポケモンも）</button>
      </p>
      <h3>この{label.startsWith('TR') ? 'レコード' : 'マシン'}で覚えるポケモン（図鑑にいる個体）</h3>
      <div className="lines">
        {learners.filter((l) => inDex(l.p)).sort((a, b) => dexOrder(a.p) - dexOrder(b.p)).map((l) => (
          <button key={l.p.slug} className="line" onClick={() => open({ kind: 'pokemon', slug: l.p.slug })}>
            <span className="pick-name">{l.p.name}</span>
            <span>{l.p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
