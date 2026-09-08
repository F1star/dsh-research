/** Replay only the external Docling process while retaining local process lifecycle behavior. */
import { fileURLToPath } from 'node:url'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'

export default class RecordedDoclingSubprocess extends LocalSubprocessRuntime {
  async resolveExecutable(command, env, signal) {
    if (command === 'recorded-docling') return process.execPath
    return super.resolveExecutable(command, env, signal)
  }

  spawn(spec) {
    if (spec.argv[1] !== '-I') return super.spawn(spec)
    return super.spawn({
      ...spec,
      argv: [process.execPath, fileURLToPath(new URL('./recorded-worker.mjs', import.meta.url)), spec.argv[3]],
    })
  }
}
