import type { HelperConfig } from './helperClient'

export const DEV_BUILD_MESSAGE =
  'The overlay file can only be made from the built app, not the dev server. In the terminal run "npm run build" and then "npm run preview", open the address it prints (usually http://localhost:4173), and try again.'

function getAttr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return m ? (m[1] ?? m[2] ?? '') : null
}

const escapeScript = (code: string) => code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--')
const escapeStyle = (css: string) => css.replace(/<\/style/gi, '<\\/style')

export interface StandaloneInput {
  /** The built index.html text. */
  html: string
  /** Where that page was loaded from (to resolve /assets/... addresses). */
  baseUrl: string
  fetchText: (url: string) => Promise<string>
  /** Overlay token from encodeShareToken. */
  token: string
  background: string | null
  /** Input helper settings to bake in, so extra buttons work in OBS. */
  helper?: HelperConfig | null
}

/**
 * Turns the built app into ONE html file with its scripts and styles inline and a
 * profile baked in. Such a file works from OBS's "Local file" option and has no size limit.
 */
export async function buildStandaloneHtml(input: StandaloneInput): Promise<string> {
  const { html, baseUrl, fetchText, token, background, helper } = input
  if (/src=["'][^"']*\/src\/main\.|@vite\/client/.test(html)) throw new Error(DEV_BUILD_MESSAGE)

  const scriptTags = [...html.matchAll(/<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi)].map((m) => m[0])
  const styleTags = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => /stylesheet/i.test(getAttr(t, 'rel') ?? ''))
  const dropTags = [...html.matchAll(/<link\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => /modulepreload|icon/i.test(getAttr(t, 'rel') ?? ''))

  if (scriptTags.length === 0) throw new Error('This page has no built script to put in the file.')

  const resolve = (src: string) => new URL(src, baseUrl).href
  const scripts = await Promise.all(
    scriptTags.map((t) => fetchText(resolve(getAttr(t, 'src') ?? ''))),
  )
  const styles = await Promise.all(
    styleTags.map((t) => fetchText(resolve(getAttr(t, 'href') ?? ''))),
  )

  let out = html
  for (const tag of [...scriptTags, ...styleTags, ...dropTags]) out = out.replace(tag, '')

  const data = `<script>window.__OVERLAY__=${JSON.stringify({ token, background, helper: helper ?? undefined })}</script>`
  const css = styles.map((c) => `<style>${escapeStyle(c)}</style>`).join('')
  const js = scripts.map((c) => `<script type="module">${escapeScript(c)}</script>`).join('')

  if (!/<\/head>/i.test(out) || !/<\/body>/i.test(out)) {
    throw new Error('This page does not look like the built app.')
  }
  out = out.replace(/<\/head>/i, () => `${data}${css}</head>`)
  out = out.replace(/<\/body>/i, () => `${js}</body>`)
  return out
}
