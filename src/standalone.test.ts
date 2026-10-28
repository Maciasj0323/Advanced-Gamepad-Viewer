import { describe, expect, it } from 'vitest'
import { buildStandaloneHtml, DEV_BUILD_MESSAGE } from './standalone'

const BUILT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <title>app</title>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`

const files: Record<string, string> = {
  'https://x.test/assets/index-abc.js': 'console.log("hi"); const s = "</script><b>";',
  'https://x.test/assets/index-abc.css': 'body{color:red}',
}
const fetchText = async (url: string) => {
  if (!(url in files)) throw new Error(`unexpected ${url}`)
  return files[url]
}

describe('standalone overlay file', () => {
  it('puts the script, styles and profile data inside one page with no outside files', async () => {
    const out = await buildStandaloneHtml({
      html: BUILT,
      baseUrl: 'https://x.test/index.html',
      fetchText,
      token: 'g.abc_-',
      background: '#00ff00',
    })
    expect(out).not.toContain('src="/assets')
    expect(out).not.toContain('href="/assets')
    expect(out).not.toContain('vite.svg')
    expect(out).toContain('<style>body{color:red}</style>')
    expect(out).toContain('window.__OVERLAY__={"token":"g.abc_-","background":"#00ff00"}')
    expect(out).toContain('<div id="root"></div>')
    // the data comes before the app script, and the app script is a module at the end
    expect(out.indexOf('__OVERLAY__')).toBeLessThan(out.indexOf('type="module"'))
    expect(out.indexOf('type="module"')).toBeGreaterThan(out.indexOf('<div id="root">'))
  })

  it('bakes in the helper settings when given, and leaves them out when not', async () => {
    const helper = { code: 'a1b2c3d4e5f60718293a4b5c', port: 9000 }
    const withHelper = await buildStandaloneHtml({
      html: BUILT,
      baseUrl: 'https://x.test/index.html',
      fetchText,
      token: 'g.a',
      background: null,
      helper,
    })
    expect(withHelper).toContain(
      'window.__OVERLAY__={"token":"g.a","background":null,"helper":{"code":"a1b2c3d4e5f60718293a4b5c","port":9000}}',
    )
    const without = await buildStandaloneHtml({
      html: BUILT,
      baseUrl: 'https://x.test/index.html',
      fetchText,
      token: 'g.a',
      background: null,
    })
    expect(without).toContain('window.__OVERLAY__={"token":"g.a","background":null}')
  })

  it('escapes a closing script tag inside the app code so the page cannot break', async () => {
    const out = await buildStandaloneHtml({
      html: BUILT,
      baseUrl: 'https://x.test/index.html',
      fetchText,
      token: 'g.a',
      background: null,
    })
    const moduleScript = out.slice(out.indexOf('<script type="module">'))
    expect(moduleScript).toContain('<\\/script><b>')
    expect(moduleScript.match(/<\/script>/g)).toHaveLength(1)
  })

  it('resolves asset addresses against the page address (including a sub-folder)', async () => {
    const seen: string[] = []
    await buildStandaloneHtml({
      html: BUILT.replace('/assets/index-abc.js', '/app/assets/index-abc.js').replace('/assets/index-abc.css', 'assets/index-abc.css'),
      baseUrl: 'https://x.test/app/',
      fetchText: async (u) => {
        seen.push(u)
        return ''
      },
      token: 'g.a',
      background: null,
    })
    expect(seen.sort()).toEqual(['https://x.test/app/assets/index-abc.css', 'https://x.test/app/assets/index-abc.js'])
  })

  it('refuses the dev server page with a clear message', async () => {
    const dev = '<html><head><script type="module" src="/@vite/client"></script></head><body><script type="module" src="/src/main.tsx"></script></body></html>'
    await expect(
      buildStandaloneHtml({ html: dev, baseUrl: 'http://localhost:5173/', fetchText, token: 'g.a', background: null }),
    ).rejects.toThrow(DEV_BUILD_MESSAGE)
  })

  it('refuses a page with no script', async () => {
    await expect(
      buildStandaloneHtml({
        html: '<html><head></head><body></body></html>',
        baseUrl: 'https://x.test/',
        fetchText,
        token: 'g.a',
        background: null,
      }),
    ).rejects.toThrow(/no built script/)
  })
})
