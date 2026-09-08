/** Build the DSH closure-factory browser entry and stage generated Remote artifacts. */
import { build } from 'esbuild'
import { copyFile, writeFile } from 'node:fs/promises'
const output = await build({
  entryPoints: ['src/browser.ts'], bundle: true, platform: 'browser', format: 'cjs',
  target: 'es2022', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  loader: { '.css': 'local-css' }, outfile: 'lib/client.js', write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
})
const javascript = output.outputFiles.find(file => file.path.endsWith('.js'))?.text
const css = output.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? ''
if (javascript === undefined) throw new Error('Browser compilation produced no JavaScript')
const style = `if (!document.querySelector('style[data-dsh-research]')) { const style = document.createElement('style'); style.dataset.dshResearch = ''; style.textContent = ${JSON.stringify(css)}; document.head.appendChild(style); }`
await writeFile('lib/client.js', `window.__ModuleLoader__.load({ id: "@f1star/dsh-research", factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;\n${style}\n${javascript}\nreturn module.exports; } });\n`)
for (const name of ['typert.host.js', 'typert.remote-client.js', 'typert.remote-client.d.ts']) {
  await copyFile(`generated/${name}`, `lib/${name}`)
}
