import { useMemo } from 'react'
import { monName } from '../battle'
import { effLabel } from '../typeEff'
import { findRaidCounters, raidGuidance } from '../raid'
import type { RaidBoss, RaidCandidate } from '../raid'
import type { GameData, OwnedPokemon } from '../types'
import { TypeChip } from './Chips'
import { Sprite } from './Sprite'

interface Props {
  data: GameData
  boss: RaidBoss
  pool: { mon: OwnedPokemon; inParty: boolean }[]
}

export function RaidPanel({ data, boss, pool }: Props) {
  const res = useMemo(() => findRaidCounters(data, boss, pool), [data, boss, pool])
  const lines = useMemo(() => (res ? raidGuidance(data, boss, res) : []), [data, boss, res])
  if (!res) return null

  return (
    <>
      <section className="card advice">
        <h3>おすすめ（受けられる ＋ 抜群を突ける）</h3>
        <p className="muted">
          相手の攻撃タイプ: {res.attackTypes.map((t) => <TypeChip key={t} data={data} slug={t} />)}
          　弱点判定: {res.defTypes.map((t) => <TypeChip key={t} data={data} slug={t} />)}
        </p>
        {pool.length === 0 && <p>手持ちが登録されていません。</p>}
        {pool.length > 0 && res.both.length === 0 && (
          <p>両方を満たす手持ちはいません。下の「片方だけ満たす」を参考にしてください。</p>
        )}
        <ul className="raid-list">
          {res.both.map((c) => <Candidate key={c.mon.id} c={c} data={data} />)}
        </ul>
      </section>

      {(res.onlyResist.length > 0 || res.onlyHit.length > 0) && (
        <details className="card advice">
          <summary>片方だけ満たす手持ち</summary>
          {res.onlyResist.length > 0 && (
            <>
              <h3>受けられるが、抜群を突けない</h3>
              <ul className="raid-list">
                {res.onlyResist.map((c) => <Candidate key={c.mon.id} c={c} data={data} />)}
              </ul>
            </>
          )}
          {res.onlyHit.length > 0 && (
            <>
              <h3>抜群を突けるが、受けられない</h3>
              <ul className="raid-list">
                {res.onlyHit.map((c) => <Candidate key={c.mon.id} c={c} data={data} />)}
              </ul>
            </>
          )}
        </details>
      )}

      <section className="card advice">
        <h3>レイドの注意</h3>
        <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
        <small>ゲームの仕様変更で挙動が変わることがあります。目安として使ってください。</small>
      </section>
    </>
  )
}

function Candidate({ c, data }: { c: RaidCandidate; data: GameData }) {
  const worstTypes = c.taken.filter((t) => t.mult === c.worst).map((t) => t.type)
  const after = c.worstAfterTera
  return (
    <li className="raid-item">
      <Sprite id={c.species.id} />
      <div className="raid-body">
        <div>
          <span className="pick-name">{monName(c.mon, data)}</span>
          {!c.inParty && <small>（ボックス）</small>}
        </div>
        <div className="raid-sub">
          受け: 最悪{effLabel(c.worst)}
          {worstTypes.length > 0 && c.worst > 0 && <>（{worstTypes.map((t) => <TypeChip key={t} data={data} slug={t} />)}）</>}
          {after !== null && after > 0.5 && c.worst <= 0.5 && ' ※自分がテラスタルすると耐性が崩れる'}
        </div>
        {c.hits.length > 0 && (
          <div className="raid-sub">
            抜群: {c.hits.map((h) => `${h.move.name}（${effLabel(h.eff)}${h.stab ? '・一致' : ''}）`).join('、')}
          </div>
        )}
      </div>
    </li>
  )
}
