import { RAID_BUILDS } from '../raidBuilds'
import type { GameData, OwnedPokemon } from '../types'
import { TypeChip } from './Chips'
import { Sprite } from './Sprite'

interface Props {
  data: GameData
  owned: OwnedPokemon[]
}

/** 定番レイドポケモンの育成論一覧 */
export function RaidBuilds({ data, owned }: Props) {
  const have = new Set(owned.map((m) => m.slug))
  return (
    <section className="card advice">
      <h3>定番レイドポケモンの育成論</h3>
      <p className="muted">一般的な型の目安です。ボスのタイプや仲間との役割分担で、技・テラスタイプは変えてください。</p>
      <div className="builds">
        {RAID_BUILDS.map((b) => {
          const p = data.pokemonBySlug.get(b.slug)
          if (!p) return null
          return (
            <details key={b.slug} className="build">
              <summary>
                <Sprite id={p.id} size={40} />
                <span className="pick-name">{p.name}</span>
                {p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}
                {have.has(b.slug) && <small>持っている</small>}
              </summary>
              <p className="raid-sub">{b.role}</p>
              <dl className="build-spec">
                <dt>テラスタイプ</dt><dd>{b.tera}</dd>
                <dt>特性</dt><dd>{b.ability}</dd>
                <dt>持ち物</dt><dd>{b.item}</dd>
                <dt>性格</dt><dd>{b.nature}</dd>
                <dt>努力値</dt><dd>{b.evs}</dd>
                <dt>技</dt><dd>{b.moves.join(' / ')}</dd>
              </dl>
              <ul>{b.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </details>
          )
        })}
      </div>
    </section>
  )
}
