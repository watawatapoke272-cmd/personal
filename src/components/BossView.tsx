import { useMemo, useState } from 'react'
import type { Enemy } from '../battle'
import { firstLevel, useBosses } from '../bosses'
import type { BossBattle, BossMember, BossesFile, RaidPreset, WildBoss } from '../bosses'
import { effectiveness } from '../typeEff'
import { norm } from '../text'
import type { GameData, GameId, PokemonData } from '../types'
import { TypeChip } from './Chips'
import { Sprite } from './Sprite'
import { WishButton } from './WishButton'
import type { WishApi } from '../wishlist'

interface Props {
  game: GameId
  data: GameData
  /** 相手として「バトル支援」に渡す */
  onUseEnemy: (e: Enemy) => void
  /** レイドボスとして「バトル支援（テラレイド）」に渡す */
  onUseRaid: (e: Enemy) => void
  /** 図鑑のポケモン詳細を開く */
  onOpenDex: (slug: string) => void
  wish: WishApi
}

type Sub = 'ai' | 'gym' | 'dlc' | 'tour' | 'legend' | 'raid'
const SUBS: { id: Sub; label: string }[] = [
  { id: 'ai', label: '博士AI' },
  { id: 'gym', label: 'ジム再戦' },
  { id: 'dlc', label: 'DLCトレーナー' },
  { id: 'tour', label: '学校最強大会' },
  { id: 'legend', label: '準伝説・伝説' },
  { id: 'raid', label: 'イベントレイド' },
]

/** 準伝説・伝説（野生の固定戦などで戦う相手）。種族値・特性・弱点はアプリのデータから出す */
const LEGEND_GROUPS: { title: string; slugs: string[] }[] = [
  { title: '災厄のポケモン（パルデア）', slugs: ['wo-chien', 'chien-pao', 'ting-lu', 'chi-yu'] },
  { title: 'ともっこ・オーガポン・モモワロウ（碧の仮面）', slugs: ['okidogi', 'munkidori', 'fezandipiti', 'ogerpon', 'pecharunt'] },
  { title: 'テラパゴス・パラドクスの準伝説（藍の円盤）', slugs: ['terapagos', 'walking-wake', 'iron-leaves', 'gouging-fire', 'raging-bolt', 'iron-boulder', 'iron-crown'] },
  { title: 'パラドクスのパートナー（表紙）', slugs: ['koraidon', 'miraidon'] },
]

const GAME_TAG: Record<BossBattle['game'], string> = { V: 'バイオレット', Sc: 'スカーレット', SV: '' }

export function BossView({ game, data, onUseEnemy, onUseRaid, onOpenDex, wish }: Props) {
  const [sub, setSub] = useState<Sub>('ai')
  const boss = useBosses()

  if (game !== 'sv') return <div className="view"><p className="muted">ボス図鑑はスカーレット・バイオレット用です。</p></div>

  return (
    <div className="view">
      <div className="seg wide" role="group" aria-label="種類">
        {SUBS.map((s) => (
          <button key={s.id} className={s.id === sub ? 'on' : ''} onClick={() => setSub(s.id)}>{s.label}</button>
        ))}
      </div>

      {sub === 'legend' && <Legends data={data} file={boss.status === 'ready' ? boss.data : null} onUseEnemy={onUseEnemy} onOpenDex={onOpenDex} wish={wish} />}
      {sub !== 'legend' && boss.status === 'loading' && <p className="muted">読み込み中…</p>}
      {sub !== 'legend' && boss.status === 'error' && (
        <div className="banner warn">ボスデータを読み込めませんでした（{boss.message}）。<code>npm run build-bosses</code> で作成できます。</div>
      )}
      {sub === 'ai' && boss.status === 'ready' && (
        <Battles
          data={data} file={boss.data} onUseEnemy={onUseEnemy} onOpenDex={onOpenDex}
          filter={(b) => b.name.startsWith('AI ') || b.name === 'Paradise Protection Protocol'}
          intro="フトゥー博士（バイオレット）／オーリム博士（スカーレット）のAI。「楽園防衛プログラム」は最後の戦いで、テラスタル後はテラバースト固定になるなど特殊ルールがあります。"
        />
      )}
      {sub === 'dlc' && boss.status === 'ready' && (
        <Battles
          data={data} file={boss.data} onUseEnemy={onUseEnemy} onOpenDex={onOpenDex}
          filter={(b) => !(b.name.startsWith('AI ') || b.name === 'Paradise Protection Protocol') && !b.group}
          intro="碧の仮面・藍の円盤のトレーナー戦（BBリーグ四天王、スグリ、ゼイユ、校長）。レベルが2つあるものは、初回と再戦で変わります。"
        />
      )}
      {sub === 'gym' && boss.status === 'ready' && (
        <Battles
          data={data} file={boss.data} onUseEnemy={onUseEnemy} onOpenDex={onOpenDex}
          filter={(b) => b.group === 'gym2'}
          intro="パルデアのジムリーダーとの2回目の戦い（チャンピオンになった後の再戦）。1回目の戦いは載せていません。"
        />
      )}
      {sub === 'tour' && boss.status === 'ready' && (
        <Battles
          data={data} file={boss.data} onUseEnemy={onUseEnemy} onOpenDex={onOpenDex}
          filter={(b) => b.group === 'tournament'}
          intro="メサジーナの学校最強大会（ストーリークリア後）。1〜3戦目はペパー、ボタン、先生たちのうちから、4戦目はチャンピオン・オモダカ・ハッサク・クラベルから出ます。初回は、ペパー、ジニア、キハダ、オモダカの順です。最初のポケモンの選択やテラパゴス・モモワロウの捕獲で、手持ちが変わります。"
        />
      )}
      {sub === 'raid' && boss.status === 'ready' && <Raids data={data} file={boss.data} onUseRaid={onUseRaid} />}
    </div>
  )
}

// ---- トレーナー戦 ----

function Battles({ data, file, filter, intro, onUseEnemy, onOpenDex }: {
  data: GameData; file: BossesFile; filter: (b: BossBattle) => boolean; intro: string; onUseEnemy: (e: Enemy) => void
  onOpenDex: (slug: string) => void
}) {
  const list = file.battles.filter(filter)
  return (
    <>
      <p className="muted">{intro}</p>
      {list.map((b, i) => (
        <details key={i} className="card advice boss">
          <summary>
            <strong>{b.nameJa}</strong>
            {[b.classJa, b.locationJa, b.headingJa].filter(Boolean).map((t, k) => <small key={k}>{t}</small>)}
            {GAME_TAG[b.game] && <small>{GAME_TAG[b.game]}</small>}
          </summary>
          <ul className="boss-party">
            {b.party.map((m, k) => <Member key={k} m={m} data={data} file={file} onUseEnemy={onUseEnemy} onOpenDex={onOpenDex} />)}
          </ul>
        </details>
      ))}
      <small>出典: Bulbapedia（CC BY-NC-SA 2.5）。個体値・努力値は省略しています。</small>
    </>
  )
}

function Member({ m, data, file, onUseEnemy, onOpenDex }: {
  m: BossMember; data: GameData; file: BossesFile; onUseEnemy: (e: Enemy) => void; onOpenDex: (slug: string) => void
}) {
  const p = data.pokemonBySlug.get(m.slug)
  if (!p) return null
  const itemName = m.item ? data.items.find((i) => i.slug === m.item)?.name ?? file.extraNames[m.item] ?? m.item : null
  const abName = m.ability ? data.abilities.get(m.ability)?.name ?? file.extraNames[m.ability] ?? m.ability : null
  const moves = m.moves.map((id) => data.moves.get(id)).filter((x) => !!x)
  return (
    <li className="boss-mon">
      <Sprite id={p.id} size={48} />
      <div className="boss-body">
        <div>
          <span className="pick-name">{p.name}</span> <small>Lv.{m.level}</small>
          {p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}
          {m.tera && <span className="tera">テラス: <TypeChip data={data} slug={m.tera} /></span>}
        </div>
        <div className="raid-sub">
          {[abName && `特性: ${abName}`, itemName && `持ち物: ${itemName}`, m.nature && `性格: ${m.nature}`].filter(Boolean).join(' / ')}
        </div>
        <div className="raid-sub">
          {moves.map((mv) => <span key={mv.id} className="boss-move">{mv.name}</span>)}
        </div>
        <button
          className="ghost small"
          onClick={() => onUseEnemy({ slug: m.slug, level: firstLevel(m.level), ability: m.ability, tera: m.tera, moves: [...m.moves, null, null, null, null].slice(0, 4) })}
        >
          バトル支援でこの相手と比べる
        </button>
        <button className="ghost small" onClick={() => onOpenDex(m.slug)}>図鑑で見る</button>
      </div>
    </li>
  )
}

// ---- 準伝説・伝説 ----

function Legends({ data, file, onUseEnemy, onOpenDex, wish }: { data: GameData; file: BossesFile | null; onUseEnemy: (e: Enemy) => void; onOpenDex: (slug: string) => void; wish: WishApi }) {
  return (
    <>
      <p className="muted">
        野生の固定戦などで戦う相手。基本データ（種族値・特性・弱点）と、分かっているものは戦闘時のレベル・技・テラスタイプも載せています。
        ウネルミナモ・テツノイサハは戦闘データが見つからなかったので、基本データのみです。
      </p>
      {LEGEND_GROUPS.map((g) => (
        <section key={g.title} className="card advice">
          <h3>{g.title}</h3>
          {g.slugs.map((s) => {
            const p = data.pokemonBySlug.get(s)
            return p ? <Legend key={s} p={p} data={data} file={file} onUseEnemy={onUseEnemy} onOpenDex={onOpenDex} wish={wish} /> : null
          })}
        </section>
      ))}
    </>
  )
}

const STAT_LABEL = { hp: 'H', atk: 'A', def: 'B', spa: 'C', spd: 'D', spe: 'S' } as const

function Legend({ p, data, file, onUseEnemy, onOpenDex, wish }: { p: PokemonData; data: GameData; file: BossesFile | null; onUseEnemy: (e: Enemy) => void; onOpenDex: (slug: string) => void; wish: WishApi }) {
  const weak = useMemo(
    () => data.types.types
      .filter((t) => t.slug !== 'stellar')
      .map((t) => ({ t, e: effectiveness(data, t.slug, p.types) }))
      .filter((x) => x.e >= 2),
    [data, p],
  )
  const total = Object.values(p.stats).reduce((a, b) => a + b, 0)
  // オーガポンは仮面ごとに別のslugなので、同じ「オーガポン」としてまとめて出す
  const family = p.slug.startsWith('ogerpon') ? (s: string) => s.startsWith('ogerpon') : (s: string) => s === p.slug
  const encounters = (file?.wild ?? []).filter((w) => family(w.slug))
  return (
    <details className="build">
      <summary>
        <Sprite id={p.id} size={40} />
        <span className="pick-name">{p.name}</span>
        {p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}
      </summary>
      <p className="raid-sub">
        種族値 {(Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[]).map((k) => `${STAT_LABEL[k]}${p.stats[k]}`).join(' ')}（合計{total}）
      </p>
      <p className="raid-sub">特性: {p.abilities.map((a) => `${data.abilities.get(a.slug)?.name ?? a.slug}${a.hidden ? '（夢）' : ''}`).join('、')}</p>
      <p className="raid-sub">
        弱点: {weak.map((x) => <span key={x.t.slug}><TypeChip data={data} slug={x.t.slug} />{x.e >= 4 ? '×4' : ''} </span>)}
      </p>
      {encounters.map((w, i) => <Encounter key={i} w={w} data={data} file={file} onUseEnemy={onUseEnemy} />)}
      {encounters.length === 0 && (
        <p className="raid-sub">戦闘データ（レベル・技）は見つかりませんでした。</p>
      )}
      <button className="ghost small" onClick={() => onUseEnemy({ slug: p.slug, level: null, ability: null, tera: null, moves: [null, null, null, null] })}>
        バトル支援でこの相手と比べる
      </button>
      <button className="ghost small" onClick={() => onOpenDex(p.slug)}>図鑑で見る（覚える技）</button>
      <WishButton wish={wish} slug={p.slug} memo="準伝説・伝説" />
    </details>
  )
}

function Encounter({ w, data, file, onUseEnemy }: { w: WildBoss; data: GameData; file: BossesFile | null; onUseEnemy: (e: Enemy) => void }) {
  const p = data.pokemonBySlug.get(w.slug)
  if (!p) return null
  const abName = w.ability ? data.abilities.get(w.ability)?.name ?? file?.extraNames[w.ability] ?? w.ability : null
  const moves = w.moves.map((id) => data.moves.get(id)).filter((x) => !!x)
  return (
    <div className="encounter">
      <div>
        <strong>{w.locationJa}</strong>{w.note && <small> {w.note}</small>} <small>Lv.{w.level}</small>
        {p.slug.startsWith('ogerpon') && <small> {p.name}</small>}
        {w.tera.length > 0 && (
          <span className="tera">
            テラス: {w.tera.map((t, i) => <span key={t}>{i > 0 && ' または '}<TypeChip data={data} slug={t} /></span>)}
          </span>
        )}
      </div>
      <div className="raid-sub">{abName && `特性: ${abName}`}</div>
      <div className="raid-sub">{moves.map((mv) => <span key={mv.id} className="boss-move">{mv.name}</span>)}</div>
      <button
        className="ghost small"
        onClick={() => onUseEnemy({ slug: w.slug, level: firstLevel(w.level), ability: w.ability, tera: null, moves: [...w.moves, null, null, null, null].slice(0, 4) })}
      >
        この戦闘の設定でバトル支援へ
      </button>
    </div>
  )
}

// ---- イベントレイド ----

function Raids({ data, file, onUseRaid }: { data: GameData; file: BossesFile; onUseRaid: (e: Enemy) => void }) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState(false)
  const list = useMemo(() => {
    const key = norm(q)
    const sorted = [...file.raids].sort((a, b) => (b.start ?? '').localeCompare(a.start ?? ''))
    const f = sorted.filter((r) => !key || norm(data.pokemonBySlug.get(r.slug)?.name ?? '').includes(key))
    return all || key ? f : f.slice(0, 20)
  }, [file, data, q, all])
  return (
    <>
      <p className="muted">
        7★イベントレイドのボス（テラスタイプ固定）。押すと、バトル支援のテラレイドにボスとテラスタイプを入れて、受けられて抜群を突ける手持ちを探します。
      </p>
      <input className="search" placeholder="ポケモン名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="pick-list">
        {list.map((r: RaidPreset, i) => {
          const p = data.pokemonBySlug.get(r.slug)
          if (!p) return null
          return (
            <li key={`${r.slug}-${r.start}-${i}`}>
              <button onClick={() => onUseRaid({ slug: r.slug, level: null, ability: null, tera: r.tera, moves: [null, null, null, null] })}>
                <Sprite id={p.id} size={40} />
                <span className="pick-name">{p.name}</span>
                <span>テラス <TypeChip data={data} slug={r.tera} /></span>
                <small>{r.start ?? ''}</small>
              </button>
            </li>
          )
        })}
      </ul>
      {!all && !q && file.raids.length > 20 && (
        <button className="ghost small" onClick={() => setAll(true)}>過去の分も全部表示（{file.raids.length}件）</button>
      )}
    </>
  )
}
