import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'

const prefix = '/fitness-tracker/'
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png' }
let updated = false
createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://127.0.0.1')
  if (pathname === '/__test_update' && req.method === 'POST') {
    updated = !updated
    res.writeHead(204).end()
    return
  }
  const file = pathname.slice(prefix.length) || 'index.html'
  if (!pathname.startsWith(prefix) || !/^(?:assets\/)?[\w.-]+$/.test(file)) { res.writeHead(404).end(); return }
  try {
    let body = await readFile(new URL('../dist/' + file, import.meta.url))
    if (updated && file === 'sw.js') body = body.toString().replace(/cacheName = prefix \+ "([^"]+)"/, 'cacheName = prefix + "$1-update"')
    if (updated && file === 'index.html') body = body.toString().replace('<title>', '<meta name="test-release" content="updated"><title>')
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body)
  } catch { res.writeHead(404).end() }
}).listen(Number(process.env.DAYLINE_TEST_PORT ?? '46173'), '127.0.0.1')
