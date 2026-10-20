import { useCallback, useEffect, useRef, useState } from 'react'
import { sanitizeSave } from './storage'
import type { SaveApi } from './storage'
import type { GameId, GameSave } from './types'

const CONFIG_KEY = 'pokemon-app:sync-config'
const AUTO_DELAY_MS = 2500
const FOCUS_MIN_INTERVAL_MS = 30_000
const TIMEOUT_MS = 20_000

export interface SyncConfig {
  /** GAS ウェブアプリのURL（…/exec） */
  url: string
  /** 合言葉（GAS側のスクリプトプロパティ SYNC_KEY と同じ値） */
  key: string
}

export function loadSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Partial<SyncConfig>
    return typeof c.url === 'string' && typeof c.key === 'string' && c.url && c.key ? { url: c.url, key: c.key } : null
  } catch {
    return null
  }
}
function storeSyncConfig(c: SyncConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c))
    else localStorage.removeItem(CONFIG_KEY)
  } catch {}
}

/** GAS に手持ちを送り、統合された最新の手持ちを受け取る */
async function requestSync(cfg: SyncConfig, game: GameId, save: GameSave): Promise<GameSave> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    // text/plain にすると、ブラウザの事前確認(CORSプリフライト)が不要になり、GASでも通る
    const res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: cfg.key, game, save }),
      signal: ctl.signal,
    })
    if (!res.ok) throw new Error(`サーバーがエラーを返しました（${res.status}）`)
    let body: { ok?: boolean; error?: string; save?: unknown }
    try {
      body = await res.json()
    } catch {
      throw new Error('GASの応答を読めません。URLが「ウェブアプリのURL（/exec）」か、公開設定が「全員」かを確認してください')
    }
    if (!body.ok) throw new Error(body.error === 'unauthorized' ? '合言葉が違います' : (body.error ?? '同期に失敗しました'))
    return sanitizeSave(body.save)
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('時間切れです（通信を確認してください）')
    // fetch は、接続できない・CORSで弾かれた場合に TypeError を投げる
    if (e instanceof TypeError) throw new Error('サーバーに接続できません。URL（…/exec）と、公開設定が「全員」になっているかを確認してください')
    throw e
  } finally {
    clearTimeout(timer)
  }
}

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'error'

export interface SyncApi {
  config: SyncConfig | null
  status: SyncStatus
  message: string
  lastSyncedAt: number | null
  /** 設定を保存し、すぐに1回同期して接続を確かめる */
  connect: (c: SyncConfig) => Promise<void>
  disconnect: () => void
  syncNow: () => Promise<void>
}

/** 手持ちを GAS と同期するフック（変更後の自動同期・画面に戻ったとき・手動） */
export function useSync(game: GameId, api: SaveApi): SyncApi {
  const [config, setConfig] = useState<SyncConfig | null>(loadSyncConfig)
  const [status, setStatus] = useState<SyncStatus>(config ? 'idle' : 'off')
  const [message, setMessage] = useState('')
  const [lastSyncedAt, setLast] = useState<number | null>(null)

  // 最新の値を非同期処理の中から読むための参照
  const latest = useRef({ api, game, config })
  latest.current = { api, game, config }
  const running = useRef(false)
  const lastRun = useRef(0)

  const run = useCallback(async (cfgOverride?: SyncConfig) => {
    const cfg = cfgOverride ?? latest.current.config
    if (!cfg || running.current) return
    running.current = true
    lastRun.current = Date.now()
    const g = latest.current.game
    const revAtStart = latest.current.api.rev
    setStatus('syncing')
    setMessage('')
    try {
      const merged = await requestSync(cfg, g, latest.current.api.save)
      // 通信中にソフトを切り替えていたら、取り込まない
      if (latest.current.game === g) latest.current.api.mergeIn(merged)
      setLast(Date.now())
      setStatus('ok')
    } catch (e) {
      setStatus('error')
      setMessage(e instanceof Error ? e.message : String(e))
      throw e
    } finally {
      running.current = false
      // 通信中にさらに編集があったら、もう一度同期する
      if (latest.current.api.rev !== revAtStart) setTimeout(() => void run().catch(() => {}), 500)
    }
  }, [])

  const syncNow = useCallback(() => run().catch(() => {}), [run])

  const connect = useCallback(
    async (c: SyncConfig) => {
      const cfg = { url: c.url.trim(), key: c.key.trim() }
      setConfig(cfg)
      latest.current.config = cfg
      storeSyncConfig(cfg)
      await run(cfg).catch(() => {})
    },
    [run],
  )
  const disconnect = useCallback(() => {
    storeSyncConfig(null)
    setConfig(null)
    setStatus('off')
    setMessage('')
  }, [])

  // ユーザー操作で手持ちが変わったら、少し待ってから同期
  useEffect(() => {
    if (!config || api.rev === 0) return
    const t = setTimeout(() => void syncNow(), AUTO_DELAY_MS)
    return () => clearTimeout(t)
  }, [api.rev, config, syncNow])

  // 起動時・ソフト切り替え時
  useEffect(() => {
    if (config) void syncNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, !!config])

  // 画面に戻ってきたとき（別の端末で更新した内容を取り込む）
  useEffect(() => {
    if (!config) return
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > FOCUS_MIN_INTERVAL_MS) void syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [config, syncNow])

  return { config, status, message, lastSyncedAt, connect, disconnect, syncNow }
}
