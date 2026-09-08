import { defineConfig } from 'vitest/config'
import ts from 'typescript'

export default defineConfig({
  plugins: [{
    name: 'standard-decorators', enforce: 'pre',
    transform(code, id) {
      if (!/\.tsx?$/.test(id) || !/^\s*@[A-Za-z_$]/m.test(code)) return
      const result = ts.transpileModule(code, { fileName: id, compilerOptions: {
        target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX, sourceMap: true,
      } })
      return { code: result.outputText, map: result.sourceMapText }
    },
  }],
  test: { execArgv: process.allowedNodeEnvironmentFlags.has('--webstorage') ? ['--no-webstorage'] : [] },
})
