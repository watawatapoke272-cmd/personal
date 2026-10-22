import { useState } from 'react'
import { abilityAdjusted, effectiveness } from '../typeEff'
import type { GameData, GameId, OwnedPokemon } from '../types'
import { Sprite } from './Sprite'

interface Props {
  data: GameData
  game: GameId
  party: OwnedPokemon[]
}

const typeNames = (data: GameData) => data.types.types.filter((t) => t.slug !== 'stellar')

const cellLabel = (m: number) => (m === 0 ? '無' : m >= 4 ? '×4' : m >= 2 ? '×2' : m <= 0.25 ? '¼' : m < 1 ? '½' : '')
const cellClass = (m: number) => (m === 0 ? 'imm' : m >= 2 ? 'weak' : m < 1 ? 'res' : '')

/** パーティの弱点・耐性の一覧（特性による無効・半減も反映。テラスタルは含めない） */
export function PartyWeakness({ data, game, party }: Props) {
  const [tera, setTera] = useState(false)
  if (party.length === 0) return null
  const useTera = game === 'sv' && tera

  const members = party.flatMap((mon) => {
    const sp = data.pokemonBySlug.get(mon.slug)
    if (!sp) return []
    const defTypes = useTera && mon.teraType && mon.teraType !== 'stellar' ? [mon.teraType] : sp.types
    return [{ mon, sp, defTypes }]
  })

  const rows = typeNames(data).map((t) => {
    const mults = members.map((m) =>
      abilityAdjusted(m.mon.ability || null, t.slug, effectiveness(data, t.slug, m.defTypes)),
    )
    const weak = mults.filter((x) => x >= 2).length
    const resist = mults.filter((x) => x < 1).length
    return { t, mults, weak, resist }
  })
  // 弱点が受けられる数を上回っているタイプ（構築の穴）
  const holes = rows.filter((r) => r.weak > r.resist)

  return (
    <section className="card advice">
      <h3>パーティの弱点・耐性</h3>
      {game === 'sv' && (
        <label className="check">
          <input type="checkbox" checked={tera} onChange={(e) => setTera(e.target.checked)} />
          全員がテラスタルした場合（登録したテラスタイプで見る）
        </label>
      )}
      {holes.length > 0 ? (
        <p>
          <strong>穴になりやすいタイプ</strong>（弱点が耐性より多い）:{' '}
          {holes.map((r) => `${r.t.name}（弱点${r.weak}・耐性${r.resist}）`).join('、')}
        </p>
      ) : (
        <p>弱点が耐性を上回るタイプはありません。</p>
      )}
      <div className="wk-scroll">
        <table className="wk">
          <thead>
            <tr>
              <th>技のタイプ</th>
              {members.map((m) => (
                <th key={m.mon.id} title={m.mon.nickname || m.sp.name}><Sprite id={m.sp.id} size={32} /></th>
              ))}
              <th>弱点</th>
              <th>耐性</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.t.slug} className={r.weak > r.resist ? 'hole' : ''}>
                <th><span className={`chip type t-${r.t.slug}`}>{r.t.name}</span></th>
                {r.mults.map((x, i) => <td key={members[i].mon.id} className={cellClass(x)}>{cellLabel(x)}</td>)}
                <td>{r.weak || ''}</td>
                <td>{r.resist || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>無＝無効、×2/×4＝弱点、½/¼＝半減。ふゆう・もらいび等の特性は反映。持ち物などは考慮していません。</small>
    </section>
  )
}
