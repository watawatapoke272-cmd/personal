import type { GameId, MachineSource } from '../types'

const yen = (n: number) => n.toLocaleString('ja-JP')

/** 技マシン/技レコードの入手情報（SV・剣盾で内容が違う） */
export function MachineSourceBlock({ game, label, src }: { game: GameId; label: string; src?: MachineSource }) {
  if (!src) return <p className="muted">入手情報のデータがありません。</p>

  if (game === 'sv')
    return (
      <dl className="src">
        <dt>作成できるようになる条件</dt>
        <dd>{src.unlock || '不明'}</dd>
        <dt>作成に必要なもの</dt>
        <dd>
          {src.lp != null && <div>LP ×{yen(src.lp)}</div>}
          {src.materials?.map((m) => (
            <div key={m.name}>{m.name} ×{m.count}</div>
          ))}
          {!src.lp && !src.materials?.length && '不明'}
        </dd>
        {src.places && src.places.length > 0 && (
          <>
            <dt>フィールドで拾える場所</dt>
            <dd>{src.places.join('、')}</dd>
          </>
        )}
        <dd className="muted note">
          {label}は、一度入手するか作成条件を満たすと、ポケモンセンターのわざマシンマシンで素材を使って作れます。
        </dd>
      </dl>
    )

  if (label.startsWith('TR'))
    return (
      <dl className="src">
        {src.watt != null && (
          <>
            <dt>ワットショップの価格</dt>
            <dd>{yen(src.watt)}ワット（品ぞろえは日替わりで、確実に買える店はありません）</dd>
          </>
        )}
        {src.places && src.places.length > 0 && (
          <>
            <dt>固定で拾える場所</dt>
            <dd>{src.places.join('、')}</dd>
          </>
        )}
        {src.raidDrops && (
          <>
            <dt>マックスレイドのドロップ</dt>
            <dd>
              <RaidList title="ソード・シールドどちらも" items={src.raidDrops.both} />
              <RaidList title="ソードのみ" items={src.raidDrops.sword} />
              <RaidList title="シールドのみ" items={src.raidDrops.shield} />
            </dd>
          </>
        )}
      </dl>
    )

  return (
    <dl className="src">
      <dt>入手場所</dt>
      <dd>
        {src.area ?? '不明'}
        {src.how && ` ／ ${src.how}`}
      </dd>
      {src.price != null && (
        <>
          <dt>価格</dt>
          <dd>{yen(src.price)}円</dd>
        </>
      )}
    </dl>
  )
}

function RaidList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <details>
      <summary>
        {title}（{items.length}か所）
      </summary>
      <div className="raid">{items.join('、')}</div>
    </details>
  )
}

/** 一覧用の短い要約 */
export function sourceSummary(game: GameId, label: string, src?: MachineSource): string {
  if (!src) return ''
  if (game === 'sv') return src.unlock ?? ''
  if (label.startsWith('TR')) return [src.watt != null && `${yen(src.watt)}ワット`, 'レイド'].filter(Boolean).join(' / ')
  return [src.area, src.price != null && `${yen(src.price)}円`].filter(Boolean).join(' / ')
}
