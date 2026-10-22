import { RAID_BUILDS } from '../raidBuilds'
import type { RaidBuild } from '../raidBuilds'
import type { GameData, OwnedPokemon, PokemonData } from '../types'
import { TypeChip } from './Chips'
import { Sprite } from './Sprite'
import { WishButton } from './WishButton'
import type { WishApi } from '../wishlist'

interface Props {
  data: GameData
  owned: OwnedPokemon[]
  onOpenDex: (slug: string) => void
  wish: WishApi
}

type Avail = 'base' | 'dlc' | 'none'
const GROUPS: { id: Avail; title: string; note: string }[] = [
  { id: 'base', title: '本編だけで入手できる', note: 'パルデア地方の図鑑に載っている（DLC不要）' },
  { id: 'dlc', title: 'DLCで入手できる', note: '碧の仮面（キタカミ）・藍の円盤（ブルベリー）の図鑑に載っている' },
  { id: 'none', title: 'DLCまででは入手できない', note: 'いずれの図鑑にもいない。HOMEから連れてくる等が必要' },
]

/** 図鑑の載り方から入手区分を決める（パルデア図鑑にいれば本編、DLC図鑑だけならDLC、どれにもいなければ不可） */
function availOf(p: PokemonData): Avail {
  if (p.dex.paldea !== undefined) return 'base'
  return p.dex.kitakami !== undefined || p.dex.blueberry !== undefined ? 'dlc' : 'none'
}

const dlcLabel = (p: PokemonData) =>
  availOf(p) !== 'dlc' ? '' : p.dex.kitakami !== undefined ? '碧の仮面' : '藍の円盤'

/** 定番レイドポケモンの育成論一覧 */
export function RaidBuilds({ data, owned, onOpenDex, wish }: Props) {
  const have = new Set(owned.map((m) => m.slug))
  const entries = RAID_BUILDS.flatMap((b) => {
    const p = data.pokemonBySlug.get(b.slug)
    return p ? [{ b, p, avail: availOf(p) }] : []
  })
  return (
    <section className="card advice">
      <h3>定番レイドポケモンの育成論</h3>
      <p className="muted">一般的な型の目安です。ボスのタイプや仲間との役割分担で、技・テラスタイプは変えてください。</p>
      {GROUPS.map((g) => {
        const list = entries.filter((e) => e.avail === g.id)
        if (list.length === 0) return null
        return (
          <div key={g.id}>
            <h4>{g.title}（{list.length}）</h4>
            <p className="raid-sub">{g.note}</p>
            <div className="builds">
              {list.map(({ b, p }) => <Build key={b.slug} b={b} p={p} data={data} have={have.has(b.slug)} tag={dlcLabel(p)} onOpenDex={onOpenDex} wish={wish} />)}
            </div>
          </div>
        )
      })}
    </section>
  )
}

function Build({ b, p, data, have, tag, onOpenDex, wish }: { b: RaidBuild; p: PokemonData; data: GameData; have: boolean; tag: string; onOpenDex: (slug: string) => void; wish: WishApi }) {
  return (
    <details className="build">
      <summary>
        <Sprite id={p.id} size={40} />
        <span className="pick-name">{p.name}</span>
        {p.types.map((t) => <TypeChip key={t} data={data} slug={t} />)}
        {tag && <small>{tag}</small>}
        {have && <small>持っている</small>}
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
      <div className="row">
        <button className="ghost small" onClick={() => onOpenDex(p.slug)}>図鑑で見る（種族値・覚える技）</button>
        {!have && <WishButton wish={wish} slug={p.slug} memo={`レイド育成: ${b.role}`} />}
      </div>
    </details>
  )
}
