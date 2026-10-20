// オフラインでも開けるようにするための簡単なキャッシュ。
// 画面(HTML)は「通信できれば最新、だめならキャッシュ」、ファイル類は「キャッシュを先に出して裏で更新」。
// 手持ちデータ自体はlocalStorageにあり、ここでは扱わない（GAS同期の通信も対象外：別オリジンのため）。
const CACHE = 'pokemon-app-v2'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k)
      await self.clients.claim()
    })(),
  )
})

async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    return (await cache.match(req)) || (await cache.match(self.registration.scope)) || Response.error()
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone())
      return res
    })
    .catch(() => null)
  return hit || (await fresh) || Response.error()
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // スプライト画像（別オリジン）は一度表示できたらキャッシュして、オフラインでも出す
  if (url.origin === 'https://raw.githubusercontent.com' && url.pathname.startsWith('/PokeAPI/sprites/')) {
    e.respondWith(staleWhileRevalidate(req))
    return
  }
  if (url.origin !== self.location.origin) return
  e.respondWith(req.mode === 'navigate' ? networkFirst(req) : staleWhileRevalidate(req))
})
