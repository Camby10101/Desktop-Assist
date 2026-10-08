import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../..')

describe('Code Guide', () => {
  it('shows the current code (run `npm run docs` after changing code)', () => {
    const run = () =>
      execFileSync(process.execPath, ['scripts/code-guide.mjs', '--check'], {
        cwd: root,
        encoding: 'utf8',
        stdio: 'pipe',
      })
    expect(run).not.toThrow()
  })
})
