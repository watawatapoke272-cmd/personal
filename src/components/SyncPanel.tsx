import { useState } from 'react'
import type { SyncApi } from '../sync'

const time = (t: number) => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })

export function SyncPanel({ sync }: { sync: SyncApi }) {
  const [url, setUrl] = useState(sync.config?.url ?? '')
  const [key, setKey] = useState(sync.config?.key ?? '')
  const [open, setOpen] = useState(!sync.config)

  return (
    <section className="card sync">
      <h3>
        端末間の同期（Googleスプレッドシート）
        <SyncBadge sync={sync} />
      </h3>
      {sync.config ? (
        <>
          <p className="muted">
            設定済み。手持ちを変更すると自動で同期します。
            {sync.lastSyncedAt && `最終同期 ${time(sync.lastSyncedAt)}`}
          </p>
          {sync.status === 'error' && <p className="warn">{sync.message}</p>}
          <div className="row">
            <button className="primary" disabled={sync.status === 'syncing'} onClick={() => void sync.syncNow()}>
              今すぐ同期
            </button>
            <button className="ghost" onClick={() => setOpen((o) => !o)}>設定</button>
            <button className="ghost danger" onClick={() => { if (window.confirm('この端末の同期設定を解除します（手持ちのデータは消えません）。')) sync.disconnect() }}>
              解除
            </button>
          </div>
        </>
      ) : (
        <p className="muted">GASのウェブアプリURLと合言葉を入れると、PCとスマホで同じ手持ちを使えます（手順は gas/README.md）。</p>
      )}
      {open && (
        <div className="sync-form">
          <label>
            ウェブアプリのURL（…/exec）
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoCapitalize="off" autoCorrect="off" />
          </label>
          <label>
            合言葉
            <input value={key} onChange={(e) => setKey(e.target.value)} type="password" autoComplete="off" />
          </label>
          <button
            className="primary"
            disabled={!url.trim() || !key.trim() || sync.status === 'syncing'}
            onClick={() => { void sync.connect({ url, key }).then(() => setOpen(false)) }}
          >
            保存して接続テスト
          </button>
          {!sync.config && sync.status === 'error' && <p className="warn">{sync.message}</p>}
        </div>
      )}
    </section>
  )
}

export function SyncBadge({ sync }: { sync: SyncApi }) {
  const map = {
    off: ['', ''],
    idle: ['☁', '同期待ち'],
    syncing: ['↻', '同期中'],
    ok: ['☁✓', '同期済み'],
    error: ['⚠', '同期エラー'],
  } as const
  const [icon, label] = map[sync.status]
  if (!icon) return null
  return <span className={`sync-badge s-${sync.status}`} title={label}>{icon} <small>{label}</small></span>
}
