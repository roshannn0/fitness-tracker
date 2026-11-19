import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const build = new URL('../dist/', import.meta.url)
async function assets(directory) {
  const paths = []
  for (const item of await readdir(new URL(directory, build), { withFileTypes: true })) {
    const name = join(directory, item.name).replaceAll('\\', '/')
    if (item.isDirectory()) paths.push(...await assets(name + '/'))
    else if (!name.endsWith('.map') && name !== 'sw.js') paths.push(name)
  }
  return paths
}
const files = (await assets('./')).sort()
const hash = createHash('sha256').update(await readFile(new URL(import.meta.url)))
for (const file of files) hash.update(file).update(await readFile(new URL(file, build)))
const version = hash.digest('hex').slice(0, 16)
const source = `
const scope = self.registration.scope
const prefix = 'dayline:' + scope + ':'
const cacheName = prefix + ${JSON.stringify(version)}
const assets = ${JSON.stringify(files)}.map(file => new URL(file, scope).href)
const shell = new URL('index.html', scope).href

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache =>
    cache.addAll(assets.map(url => new Request(url, { cache: 'reload' })))))
})
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const old = (await caches.keys()).filter(key => key.startsWith(prefix) && key !== cacheName)
    await Promise.all(old.slice(0, Math.max(0, old.length - 1)).map(key => caches.delete(key)))
    await self.clients.claim()
  })())
})
self.addEventListener('message', event => {
  if (event.data === 'activate-update') event.waitUntil(self.skipWaiting())
})
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith(scope)) return
  const url = new URL(event.request.url)
  const navigation = event.request.mode === 'navigate'
  const entry = navigation && (url.pathname === new URL(scope).pathname || url.pathname === new URL(shell).pathname)
  if (!entry && !assets.includes(url.href) && !url.pathname.startsWith(new URL('assets/', scope).pathname)) return
  event.respondWith((async () => {
    const cache = await caches.open(cacheName)
    const found = await cache.match(entry ? shell : event.request)
    if (found) return found
    if (!entry) {
      const older = (await caches.keys()).filter(key => key.startsWith(prefix) && key !== cacheName)
      for (const key of older) {
        const saved = await caches.match(event.request, { cacheName: key })
        if (saved) return saved
      }
    }
    return fetch(event.request)
  })())
})
`
await writeFile(new URL('sw.js', build), source)
console.log('Precached', files.length, 'files ·', version)
