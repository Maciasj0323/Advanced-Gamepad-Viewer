import http from 'node:http'
import { timingSafeEqual } from 'node:crypto'

// What the overlay may ask to watch: "key:KeyR" or "mouse:3". Nothing else is ever sent.
const WATCH_ITEM = /^(key:[A-Za-z0-9_]{1,30}|mouse:\d{1,2})$/

function sameText(a, b) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * A tiny local server. The overlay connects to /events with the helper code and the list
 * of inputs it cares about; the helper then reports only those inputs, nothing else.
 * It listens on this PC only and refuses anyone without the code.
 */
export function createBridge({ code, port = 8765, host = '127.0.0.1' }) {
  const clients = new Set()
  const held = new Set()

  const headers = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  }

  const server = http.createServer((req, res) => {
    let url
    try {
      url = new URL(req.url ?? '/', 'http://127.0.0.1')
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    if (url.pathname !== '/events') {
      res.writeHead(404)
      res.end()
      return
    }
    if (!sameText(url.searchParams.get('code') ?? '', code)) {
      res.writeHead(403, { 'Access-Control-Allow-Origin': '*' })
      res.end('Wrong helper code')
      return
    }
    const watch = new Set(
      (url.searchParams.get('watch') ?? '').split(',').filter((w) => WATCH_ITEM.test(w)).slice(0, 64),
    )
    res.writeHead(200, headers)
    res.write('retry: 2000\n\n')
    const client = { res, watch }
    clients.add(client)
    req.on('close', () => clients.delete(client))
  })

  const heartbeat = setInterval(() => {
    for (const c of clients) c.res.write(': ping\n\n')
  }, 15000)
  heartbeat.unref()

  const isWatched = (binding) => {
    for (const c of clients) if (c.watch.has(binding)) return true
    return false
  }

  const send = (binding, down) => {
    const line = `data: ${JSON.stringify({ d: down ? 1 : 0, b: binding })}\n\n`
    for (const c of clients) if (c.watch.has(binding)) c.res.write(line)
  }

  return {
    server,
    listen() {
      return new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => resolve(server.address().port))
      })
    },
    close() {
      clearInterval(heartbeat)
      for (const c of clients) c.res.end()
      clients.clear()
      return new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections?.()
      })
    },
    /** Key or button went down. Repeats while held are ignored; unwatched inputs are dropped. */
    press(binding) {
      if (held.has(binding) || !isWatched(binding)) return
      held.add(binding)
      send(binding, true)
    },
    release(binding) {
      if (!held.delete(binding)) return
      send(binding, false)
    },
    clientCount: () => clients.size,
  }
}
