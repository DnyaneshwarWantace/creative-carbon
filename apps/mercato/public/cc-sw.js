const CACHE = 'cc-plant-v1'
const CACHED_API = [/^\/api\/cc_production\/(resin|coating|press|moulding|finishing)\/setup/, /^\/api\/cc_production\/masters/, /^\/api\/cc_lists\//, /^\/api\/cc_production\/bstage$/]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/cc-icon-192.png', '/cc-manifest.webmanifest'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  const cacheable = CACHED_API.some((pattern) => pattern.test(url.pathname)) || url.pathname.startsWith('/_next/static/')
  if (!cacheable) return
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() => caches.match(request).then((cached) => cached || new Response(JSON.stringify({ error: 'Offline and not saved on this phone yet' }), { status: 503, headers: { 'content-type': 'application/json' } }))),
  )
})
