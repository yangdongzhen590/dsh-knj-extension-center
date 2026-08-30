// tsdown config for the dsh-knj-extension-center client bundle.
//
// Bundle format: the DSH web shell loads each plugin bundle as a CLASSIC
// `<script>` and expects it to register its factory via
// `window.__ModuleLoader__.load({ id, factory })`; the factory receives a
// `require` bound to the loader module table. So the client bundle is CJS,
// wrapped in the load banner (mirroring the shipped dsh-knj-menu /
// dsh-scheduler bundles). Externals (react + the dsh client packages) stay
// `require()`d from the loader table; everything else (jszip, the views) is
// inlined so the loader table never has to answer a foreign request.
//
// CSS: the loader fetches exactly one artifact per plugin (client.js) and
// claims `<style data-plugin>` tags the factory injects at materialization
// (tracked via `data-plugin-css`). A separate emitted CSS asset would never
// be fetched, so `cssModulePlugin` converts the views' `.module.css` import
// into an inline JS module that (a) exports the scoped class map and (b)
// injects the rewritten stylesheet as a `<style data-plugin
// data-plugin-css>` tag. Class names are prefixed `skc-` so they cannot
// collide with the shell's own styles; the rewrite is a plain class-selector
// prefix (the stylesheet has no keyframes / :global / url() cases). The
// resolved id carries a non-`inline` query so tsdown's built-in CSS pipeline
// (which would otherwise try to parse the emitted JS as CSS) skips it.
import { defineConfig } from 'tsdown'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/** Plugin identity shared with the mount/entry style tags (loader claim key). */
const PLUGIN_ID = 'dsh-knj-extension-center'
/** data-plugin-css key of the view stylesheet. */
const CSS_NS = 'skill-center'
/** Class-selector prefix (CSS-module scoping stand-in). */
const CLASS_PREFIX = 'skc-'
/** Non-inline query marking our hand-rolled css-module module. */
const CSS_QUERY = '?skc-module'

const CLASS_RE = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g

function cssModulePlugin() {
  return {
    name: 'skill-center-css-module-inline',
    resolveId(source: string, importer?: string) {
      if (!source.endsWith('.module.css') || !importer) return null
      return resolve(dirname(importer), source) + CSS_QUERY
    },
    load(id: string) {
      if (!id.includes('.module.css' + CSS_QUERY)) return null
      const file = id.split('?')[0]
      this.addWatchFile(file)
      const raw = readFileSync(file, 'utf8')
      const names = new Set<string>()
      const prefixed = raw.replace(CLASS_RE, (match, name: string) => {
        names.add(name)
        return `.${CLASS_PREFIX}${name}`
      })
      const map: Record<string, string> = {}
      for (const name of [...names].sort()) map[name] = `${CLASS_PREFIX}${name}`
      const code = [
        `const css = ${JSON.stringify(prefixed)};`,
        `if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css=${JSON.stringify(CSS_NS)}]')) {`,
        `  const style = document.createElement('style');`,
        `  style.setAttribute('data-plugin', ${JSON.stringify(PLUGIN_ID)});`,
        `  style.setAttribute('data-plugin-css', ${JSON.stringify(CSS_NS)});`,
        `  style.textContent = css;`,
        `  document.head.appendChild(style);`,
        `}`,
        `export default ${JSON.stringify(map)};`,
      ].join('\n')
      return { code }
    },
  }
}

/** Externals resolved from the loader module table at runtime. */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-slots',
]

export default defineConfig({
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: false,
  // 不清理 outDir：host 侧由 tsc 产出 lib/index.js（见 package.json build 脚本），
  // tsdown 只负责追加 client bundle，避免 tsc 产物被清空。
  clean: false,
  plugins: [cssModulePlugin()],
  deps: {
    neverBundle: [...CLIENT_EXTERNALS],
    alwaysBundle: (source: string) => (CLIENT_EXTERNALS.includes(source) ? undefined : true),
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
