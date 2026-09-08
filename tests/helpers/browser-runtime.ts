/** Load the published DSH browser factory without treating it as a Node ESM entry. */
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import * as cordis from '@deepseek-ai/cordis'
import * as slots from '@deepseek-ai/dsh-client-ui-slots'

type Runtime = typeof import('@deepseek-ai/dsh-client-runtime/client')
let factory: ((require: (id: string) => unknown) => Runtime) | undefined
runInNewContext(readFileSync(new URL(import.meta.resolve('@deepseek-ai/dsh-client-runtime/client')), 'utf8'), {
  window: { __ModuleLoader__: { load(value: { factory: typeof factory }) { factory = value.factory } } },
  console, setTimeout, clearTimeout, AbortController, AbortSignal, queueMicrotask,
})
if (factory === undefined) throw new Error('Published client runtime did not register a factory')
export const { SlotRegistry } = factory(id => {
  if (id === '@deepseek-ai/cordis') return cordis
  if (id === '@deepseek-ai/dsh-client-ui-slots') return slots
  throw new Error(`Unexpected browser dependency ${id}`)
})
