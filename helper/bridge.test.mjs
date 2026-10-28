import http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createBridge } from './bridge.mjs'

const CODE = 'a1b2c3d4e5f60718293a4b5c'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
let bridge

afterEach(async () => {
  await bridge?.close()
  bridge = undefined
})

async function start() {
  bridge = createBridge({ code: CODE, port: 0 })
  return bridge.listen()
}

function open(port, query) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: `/events?${query}`, agent: false }, (res) => {
      let text = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (text += c))
      resolve({ res, status: res.statusCode, text: () => text })
    })
    req.on('error', reject)
  })
}

describe('input helper server', () => {
  it('listens on this PC only', async () => {
    await start()
    expect(bridge.server.address().address).toBe('127.0.0.1')
  })

  it('refuses a wrong or missing code', async () => {
    const port = await start()
    expect((await open(port, 'code=wrong&watch=key:KeyR')).status).toBe(403)
    expect((await open(port, 'watch=key:KeyR')).status).toBe(403)
    expect(bridge.clientCount()).toBe(0)
  })

  it('only answers /events', async () => {
    const port = await start()
    const res = await new Promise((resolve) =>
      http.get({ host: '127.0.0.1', port, path: '/', agent: false }, resolve),
    )
    expect(res.statusCode).toBe(404)
    res.resume()
  })

  it('accepts the right code and allows the overlay page to read the stream', async () => {
    const port = await start()
    const c = await open(port, `code=${CODE}&watch=key:KeyR`)
    expect(c.status).toBe(200)
    expect(c.res.headers['content-type']).toBe('text/event-stream')
    expect(c.res.headers['access-control-allow-origin']).toBe('*')
  })

  it('reports only the inputs the overlay asked for, down and up', async () => {
    const port = await start()
    const c = await open(port, `code=${CODE}&watch=${encodeURIComponent('key:KeyR,mouse:3')}`)
    await wait(30)
    bridge.press('key:KeyR')
    bridge.press('key:KeyF') // not watched: never sent
    bridge.press('mouse:3')
    bridge.release('key:KeyR')
    bridge.release('key:KeyF')
    await wait(50)
    const lines = c.text().split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)))
    expect(lines).toEqual([
      { d: 1, b: 'key:KeyR' },
      { d: 1, b: 'mouse:3' },
      { d: 0, b: 'key:KeyR' },
    ])
  })

  it('ignores repeats while a key is held', async () => {
    const port = await start()
    const c = await open(port, `code=${CODE}&watch=key:KeyR`)
    await wait(30)
    bridge.press('key:KeyR')
    bridge.press('key:KeyR')
    bridge.press('key:KeyR')
    await wait(50)
    expect(c.text().match(/data: /g)).toHaveLength(1)
  })

  it('throws away malformed watch entries', async () => {
    const port = await start()
    const c = await open(port, `code=${CODE}&watch=${encodeURIComponent('key:Bad Code,<script>,key:,mouse:abc')}`)
    await wait(30)
    bridge.press('key:Bad Code')
    await wait(30)
    expect(c.text()).not.toContain('data: ')
  })

  it('sends nothing when nobody is watching', async () => {
    await start()
    expect(() => {
      bridge.press('key:KeyR')
      bridge.release('key:KeyR')
    }).not.toThrow()
  })
})
