import { useEffect, useMemo, useState } from 'react'
import { advise, effLabel, monName } from '../battle'
import type { BattleOptions, Enemy, Outcome } from '../battle'
import { describeKo } from '../calc'
import { GAMES } from '../data'
import type { SaveApi } from '../storage'
import type { GameData, GameId } from '../types'
import { TypeChip } from './Chips'
import { MovePicker } from './MovePicker'
import { PokemonPicker } from './PokemonPicker'

interface Props {
  game: GameId
  data: GameData
  api: SaveApi
  enemy: Enemy | null
  setEnemy: (e: Enemy | null) => void
}

const SPEED_LABEL = { faster: '先手', slower: '後手', unclear: '同程度' } as const
const OUTCOME_LABEL: Record<Outcome, string> = { win: '有利', close: '互角', lose: '不利', none: '―' }

type Saved = { strong: boolean; weather: 'sun' | 'rain' | null; myTera: boolean; withBox: boolean }
const OPT_KEY = 'pokemon-app:battle-options'
function loadSaved(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(OPT_KEY) ?? 'null') as Partial<Saved> | null
    return {
      strong: !!raw?.strong,
      weather: raw?.weather === 'sun' || raw?.weather === 'rain' ? raw.weather : null,
      myTera: !!raw?.myTera,
      withBox: !!raw?.withBox,
    }
  } catch {
    return { strong: false, weather: null, myTera: false, withBox: false }
  }
}

export function BattleView({ game, data, api, enemy, setEnemy }: Props) {
  const [picking, setPicking] = useState<null | { kind: 'enemy' } | { kind: 'move'; slot: number }>(null)
  const [opts, setOpts] = useState<Saved>(loadSaved)
  useEffect(() => {
    try {
      localStorage.setItem(OPT_KEY, JSON.stringify(opts))
    } catch {}
  }, [opts])
  const { save } = api
  const hasTera = GAMES[game].hasTera

  const partyIds = save.party
  const noParty = partyIds.length === 0
  const pool = useMemo(() => {
    const all = Object.values(save.mons)
    const useBox = opts.withBox || noParty
    return all
      .filter((m) => useBox || partyIds.includes(m.id))
      .map((m) => ({ mon: m, inParty: partyIds.includes(m.id) }))
  }, [save, opts.withBox, noParty, partyIds])

  const enemyP = enemy ? data.pokemonBySlug.get(enemy.slug) : undefined
  const battleOpts: BattleOptions = useMemo(
    () => ({ game, strong: opts.strong, weather: opts.weather, myTera: hasTera && opts.myTera }),
    [game, opts, hasTera],
  )
  const advice = useMemo(
    () => (enemy && enemyP ? advise(data, enemy, pool, battleOpts, hasTera) : null),
    [data, enemy, enemyP, pool, battleOpts, hasTera],
  )

  if (picking?.kind === 'enemy')
    return (
      <div className="sheet" role="dialog" aria-modal="true">
        <PokemonPicker
          data={data}
          onCancel={() => setPicking(null)}
          onPick={(p) => {
            // 種類を変えたら、前の相手の技・特性は引き継がない
            setEnemy({ slug: p.slug, level: enemy?.level ?? null, ability: null, tera: null, moves: [null, null, null, null] })
            setPicking(null)
          }}
        />
      </div>
    )
  if (picking?.kind === 'move' && enemy && enemyP) {
    const slot = picking.slot
    return (
      <div className="sheet" role="dialog" aria-modal="true">
        <MovePicker
          data={data}
          mon={enemyP}
          taken={enemy.moves.filter((_, i) => i !== slot)}
          onCancel={() => setPicking(null)}
          onPick={(id) => {
            const moves = [...enemy.moves]
            moves[slot] = id
            setEnemy({ ...enemy, moves })
            setPicking(null)
          }}
        />
      </div>
    )
  }

  const best = advice?.pick?.best?.calc

  return (
    <div className="view battle">
      <h2>相手のポケモン</h2>
      <div className="card enemy">
        <button className="species-btn" onClick={() => setPicking({ kind: 'enemy' })}>
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
          <>
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

            <div className="field">
              相手の技（分かるものだけ。未入力ならタイプ一致技で想定）
              <ul className="move-slots small">
                {enemy.moves.map((id, i) => {
                  const m = id != null ? data.moves.get(id) : undefined
                  return (
                    <li key={i}>
                      <button onClick={() => setPicking({ kind: 'move', slot: i })}>
                        {m ? <span className="pick-name">{m.name}</span> : <span className="muted">技{i + 1}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          </>
        )}
        {enemy && <button className="ghost small" onClick={() => setEnemy(null)}>入力をクリア</button>}
      </div>

      <h2>計算の条件</h2>
      <div className="card opts">
        <div className="field">
          相手の能力の見積もり
          <div className="seg">
            <button className={!opts.strong ? 'on' : ''} onClick={() => setOpts({ ...opts, strong: false })}>標準（努力値0）</button>
            <button className={opts.strong ? 'on' : ''} onClick={() => setOpts({ ...opts, strong: true })}>強め（努力値252）</button>
          </div>
        </div>
        <label className="field">
          天候
          <select
            value={opts.weather ?? ''}
            onChange={(e) => setOpts({ ...opts, weather: e.target.value === 'sun' || e.target.value === 'rain' ? e.target.value : null })}
          >
            <option value="">なし</option>
            <option value="sun">晴れ</option>
            <option value="rain">雨</option>
          </select>
        </label>
        {hasTera && (
          <label className="check">
            <input type="checkbox" checked={opts.myTera} onChange={(e) => setOpts({ ...opts, myTera: e.target.checked })} />
            自分もテラスタルする（登録したテラスタイプを使う）
          </label>
        )}
        <label className="check">
          <input
            type="checkbox" checked={opts.withBox || noParty} disabled={noParty}
            onChange={(e) => setOpts({ ...opts, withBox: e.target.checked })}
          />
          ボックスの手持ちも候補に含める{noParty && '（パーティが空なので含めています）'}
        </label>
      </div>

      {!enemy && <p className="muted">相手のポケモンを選ぶと、選出と技の提案が出ます。</p>}

      {advice && (
        <>
          <div className="card headline">{advice.headline}</div>
          {best && advice.pick && (
            <p className="muted">相手の想定HP: 約{advice.enemyHp}（{advice.enemy.name}）</p>
          )}

          <Section title="攻撃（どの技で攻めるか）" lines={advice.attack} />
          <Section title="受け（誰で受けるか／避けるか）" lines={advice.defense} />
          <Section title="素早さ（先手・後手）" lines={advice.speed} />
          <Section title="注意点（特性・テラスタル・Lv・計算の前提）" lines={advice.cautions} />

          {advice.tmIdeas.length > 0 && advice.pick && (
            <section className="card advice">
              <h3>覚えさせるなら（技マシン）</h3>
              <ul>
                {advice.tmIdeas.map((t) => (
                  <li key={t.move.id}>
                    {monName(advice.pick!.mon, data)}に {t.label}「{t.move.name}」（{effLabel(t.eff)}・威力{t.move.power}）
                  </li>
                ))}
              </ul>
              <small>入手場所・必要素材は「図鑑・技・TM」タブで確認できます。</small>
            </section>
          )}

          {advice.ranking.length > 0 && (
            <details className="card advice">
              <summary>手持ち全員の評価（総合順）</summary>
              <table className="eval">
                <thead>
                  <tr><th>ポケモン</th><th>与ダメ</th><th>被ダメ(最大)</th><th>素早さ</th><th>見込み</th></tr>
                </thead>
                <tbody>
                  {advice.ranking.map((r) => (
                    <tr key={r.mon.id}>
                      <td>{monName(r.mon, data)}{!r.inParty && <small>（ボックス）</small>}</td>
                      <td>
                        {r.best
                          ? `${r.best.move.name} ${r.best.calc ? describeKo(r.best.calc) : effLabel(r.best.eff)}`
                          : '有効技なし'}
                      </td>
                      <td>{r.worst ? `${Math.round(r.worstPct)}%` : '―'}</td>
                      <td>{SPEED_LABEL[r.speed.verdict]}</td>
                      <td>{OUTCOME_LABEL[r.outcome]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <small>
                ダメージは目安です（実数値とダメージ式で計算。持ち物・特性は主なものだけ反映）。
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
