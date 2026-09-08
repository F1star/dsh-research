/** Frozen real-model response; request bytes must match the visually verified scan. */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

if (process.argv[2] === '--check') {
  process.stdout.write(JSON.stringify({ protocol: 1, ready: true }))
  process.exit(0)
}

let input = ''
for await (const chunk of process.stdin) input += chunk
const request = JSON.parse(input)
assert.equal(request.protocol, 1)
assert.deepEqual(Buffer.from(request.sourceBase64, 'base64'), await readFile(new URL('./scientific-scan.pdf', import.meta.url)))
const parsed = JSON.parse(await readFile(new URL('./extraction.json', import.meta.url), 'utf8'))
process.stdout.write(JSON.stringify({ protocol: 1, parsed }))
