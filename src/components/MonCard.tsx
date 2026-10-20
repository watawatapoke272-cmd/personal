import type { GameData, GameId, OwnedPokemon } from '../types'
import { TypeChip } from './Chips'
import { Sprite } from './Sprite'

export function monTitle(mon: OwnedPokemon, data: GameData): string {
  const base = data.pokemonBySlug.get(mon.slug)?.name ?? mon.slug
  return mon.nickname ? `${mon.nickname}（${base}）` : base
}

interface Props {
  mon: OwnedPokemon
  data: GameData
  game: GameId
  onOpen: () => void
  /** パーティ内の並べ替えボタン（パーティ表示のときだけ渡す） */
  onMove?: (dir: -1 | 1) => void
  index?: number
}

export function MonCard({ mon, data, game, onOpen, onMove, index }: Props) {
  const p = data.pokemonBySlug.get(mon.slug)
  const ability = data.abilities.get(mon.ability)?.name
  return (
    <div className="card mon">
      <button className="mon-main" onClick={onOpen}>
        <div className="mon-head">
          {index !== undefined && <span className="slot-no">{index + 1}</span>}
          {p && <Sprite id={p.id} size={40} />}
          <span className="mon-name">{monTitle(mon, data)}</span>
          <span className="mon-lv">Lv.{mon.level}</span>
        </div>
        <div className="mon-types">
          {p?.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}
          {game === 'sv' && mon.teraType && (
            <span className="tera">
              テラス: <TypeChip data={data} slug={mon.teraType} />
            </span>
          )}
        </div>
        <div className="mon-sub">
          {[ability, mon.item && `持ち物: ${mon.item}`].filter(Boolean).join(' / ') || '　'}
        </div>
        <ul className="mon-moves">
          {mon.moves.map((id, i) => (
            <li key={i} className={id == null ? 'empty' : ''}>
              {id == null ? '―' : (data.moves.get(id)?.name ?? `技#${id}`)}
            </li>
          ))}
        </ul>
      </button>
      {onMove && (
        <div className="mon-order">
          <button aria-label="前へ" onClick={() => onMove(-1)}>◀</button>
          <button aria-label="後ろへ" onClick={() => onMove(1)}>▶</button>
        </div>
      )}
    </div>
  )
}
