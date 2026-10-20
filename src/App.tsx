import { useState } from 'react'
import type { Enemy } from './battle'
import { BattleView } from './components/BattleView'
import { DexView } from './components/DexView'
import { MonsView } from './components/MonsView'
import { SyncBadge } from './components/SyncPanel'
import { GAMES, useGameData } from './data'
import { loadGameChoice, saveGameChoice, useSave } from './storage'
import { useSync } from './sync'
import type { GameId } from './types'

type Tab = 'mons' | 'dex' | 'battle'
const TABS: { id: Tab; label: string }[] = [
  { id: 'mons', label: '手持ち' },
  { id: 'dex', label: '図鑑・技・TM' },
  { id: 'battle', label: 'バトル支援' },
]

export default function App() {
  const [game, setGame] = useState<GameId>(loadGameChoice)
  const [tab, setTab] = useState<Tab>('mons')
  const [enemy, setEnemy] = useState<Enemy | null>(null)
  const api = useSave(game)
  const sync = useSync(game, api)
  const ds = useGameData(game)

  function chooseGame(g: GameId) {
    setGame(g)
    setEnemy(null) // ソフトが変わると別のポケモン一覧になるため、相手の入力は消す
    saveGameChoice(g)
  }

  return (
    <div className="app">
      <header>
        <h1>ポケモン攻略メモ <SyncBadge sync={sync} /></h1>
        <div className="seg" role="group" aria-label="ソフト">
          {(Object.keys(GAMES) as GameId[]).map((g) => (
            <button key={g} className={g === game ? 'on' : ''} onClick={() => chooseGame(g)}>
              {GAMES[g].short}
            </button>
          ))}
        </div>
      </header>

      <main>
        {ds.status === 'loading' && <p className="muted">データを読み込み中…</p>}
        {ds.status === 'error' && (
          <div className="banner warn">
            データを読み込めませんでした（{ds.message}）。<code>npm run build-data</code> を実行したか確認してください。
          </div>
        )}
        {ds.status === 'ready' && tab === 'mons' && <MonsView game={game} data={ds.data} api={api} sync={sync} />}
        {ds.status === 'ready' && tab === 'battle' && (
          <BattleView game={game} data={ds.data} api={api} enemy={enemy} setEnemy={setEnemy} />
        )}
        {ds.status === 'ready' && tab === 'dex' && (
          <DexView game={game} data={ds.data} owned={Object.values(api.save.mons)} />
        )}
      </main>

      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
