import { useMemo, useState } from 'react'
import { advise, effLabel, monName } from '../battle'
import type { Enemy } from '../battle'
import { GAMES } from '../data'
import type { SaveApi } from '../storage'
import type { GameData, GameId } from '../types'
import { PokemonPicker } from './PokemonPicker'
import { TypeChip } from './Chips'

interface Props {
  game: GameId
  data: GameData
  api: SaveApi
  enemy: Enemy | null
  setEnemy: (e: Enemy | null) => void
}

const SPEED_LABEL = { faster: '先手', slower: '後手', unclear: '同程度' } as const

export function BattleView({ game, data, api, enemy, setEnemy }: Props) {
  const [picking, setPicking] = useState(false)
  const [withBox, setWithBox] = useState(false)
  const { save } = api
  const hasTera = GAMES[game].hasTera

  const partyIds = save.party
  const noParty = partyIds.length === 0
  const pool = useMemo(() => {
    const all = Object.values(save.mons)
    const useBox = withBox || noParty
    return all
      .filter((m) => useBox || partyIds.includes(m.id))
      .map((m) => ({ mon: m, inParty: partyIds.includes(m.id) }))
  }, [save, withBox, noParty, partyIds])

  const enemyP = enemy ? data.pokemonBySlug.get(enemy.slug) : undefined
  const advice = useMemo(
    () => (enemy && enemyP ? advise(data, enemy, pool, hasTera) : null),
    [data, enemy, enemyP, pool, hasTera],
  )

  if (picking)
    return (
      <div className="sheet" role="dialog" aria-modal="true">
        <PokemonPicker
          data={data}
          onCancel={() => setPicking(false)}
          onPick={(p) => {
            setEnemy({ slug: p.slug, level: enemy?.level ?? null, ability: null, tera: null })
            setPicking(false)
          }}
        />
      </div>
    )

  return (
    <div className="view battle">
      <h2>相手のポケモン</h2>
      <div className="card enemy">
        <button className="species-btn" onClick={() => setPicking(true)}>
          {enemyP ? (
            <>
              <span className="pick-name">{enemyP.name}</span>
              <span>{enemyP.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}</span>
              <small>変更</small>
            </>
          ) : (
            <span className="muted">相手の名前を入力して選ぶ</span>
          )}
        </button>

        {enemy && enemyP && (
          <div className="grid2">
            <label>
              相手のLv（任意）
              <input
                type="number" inputMode="numeric" min={1} max={100} placeholder="不明"
                value={enemy.level ?? ''}
                onChange={(e) => {
                  const v = e.target.value === '' ? null : Math.min(100, Math.max(1, Math.trunc(Number(e.target.value)) || 1))
                  setEnemy({ ...enemy, level: v })
                }}
              />
            </label>
            <label>
              特性（分かれば）
              <select value={enemy.ability ?? ''} onChange={(e) => setEnemy({ ...enemy, ability: e.target.value || null })}>
                <option value="">不明</option>
                {enemyP.abilities.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {data.abilities.get(a.slug)?.name ?? a.slug}{a.hidden ? '（夢特性）' : ''}
                  </option>
                ))}
              </select>
            </label>
            {hasTera && (
              <label>
                テラスタル
                <select value={enemy.tera ?? ''} onChange={(e) => setEnemy({ ...enemy, tera: e.target.value || null })}>
                  <option value="">していない/不明</option>
                  {data.types.types.map((t) => (
                    <option key={t.slug} value={t.slug}>{t.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        {enemy && <button className="ghost small" onClick={() => setEnemy(null)}>入力をクリア</button>}
      </div>

      <label className="check">
        <input type="checkbox" checked={withBox || noParty} disabled={noParty} onChange={(e) => setWithBox(e.target.checked)} />
        ボックスの手持ちも候補に含める{noParty && '（パーティが空なので含めています）'}
      </label>

      {!enemy && <p className="muted">相手のポケモンを選ぶと、選出と技の提案が出ます。</p>}

      {advice && (
        <>
          <div className="card headline">{advice.headline}</div>

          <Section title="攻撃（どの技で攻めるか）" lines={advice.attack} />
          <Section title="受け（誰で受けるか／避けるか）" lines={advice.defense} />
          <Section title="素早さ（先手・後手）" lines={advice.speed} />
          <Section title="注意点（特性・テラスタル・Lv）" lines={advice.cautions} />

          {advice.tmIdeas.length > 0 && advice.pick && (
            <section className="card advice">
              <h3>覚えさせるなら（技マシン）</h3>
              <ul>
                {advice.tmIdeas.map((t) => (
                  <li key={t.move.id}>
                    {advice.pick && monName(advice.pick.mon, data)}に {t.label}「{t.move.name}」（{effLabel(t.eff)}・威力{t.move.power}）
                  </li>
                ))}
              </ul>
              <small>入手場所・必要素材は「図鑑・技・TM」タブで確認できるようになる予定です。</small>
            </section>
          )}

          {advice.ranking.length > 0 && (
            <details className="card advice">
              <summary>手持ち全員の評価（総合順）</summary>
              <table className="eval">
                <thead>
                  <tr><th>ポケモン</th><th>攻撃</th><th>受け</th><th>素早さ</th></tr>
                </thead>
                <tbody>
                  {advice.ranking.map((r) => (
                    <tr key={r.mon.id}>
                      <td>{monName(r.mon, data)}{!r.inParty && <small>（ボックス）</small>}</td>
                      <td>{r.best ? `${r.best.move.name}（${effLabel(r.best.eff)}）` : '有効技なし'}</td>
                      <td>{effLabel(r.defenseWorst)}</td>
                      <td>{SPEED_LABEL[r.speed.verdict]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <small>
                これはタイプ相性・タイプ一致・技の威力・命中による簡易判定です。ダメージ計算ではなく、持ち物・能力ランク・天候などは考慮していません。
              </small>
            </details>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <section className="card advice">
      <h3>{title}</h3>
      <ul>
        {lines.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </section>
  )
}
