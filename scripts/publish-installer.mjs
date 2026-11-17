// Puts the installer just built (apps/desktop/dist) in installer/ at the top of the repository,
// with its signature, so the newest one can be downloaded straight from the repository's main page
// on GitHub. Anything older in installer/ is removed: only the latest version is kept. Run by
// `npm run dist` after signing; commit installer/ with the release.
//
// GitHub refuses any file over 100 MB, so this stops (and copies nothing) if the installer is
// that big.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = join(root, 'apps', 'desktop')
const { version } = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
const name = `Desktop Wizard-Setup-${version}.exe`
const built = join(app, 'dist', name)
const target = join(root, 'installer')

/** GitHub's limit for a file pushed to a repository. */
const GITHUB_LIMIT = 100 * 1024 * 1024

for (const file of [built, `${built}.sig`]) {
  if (!existsSync(file)) {
    console.error(`${file} isn't there: run npm run dist first.`)
    process.exit(1)
  }
}
const size = statSync(built).size
if (size >= GITHUB_LIMIT) {
  console.error(
    `${name} is ${(size / 1024 / 1024).toFixed(1)} MB: GitHub won't take a file over 100 MB, ` +
      'so it has not been copied to installer/.',
  )
  process.exit(1)
}

mkdirSync(target, { recursive: true })
for (const old of readdirSync(target)) {
  if (old !== name && old !== `${name}.sig`) rmSync(join(target, old))
}
copyFileSync(built, join(target, name))
copyFileSync(`${built}.sig`, join(target, `${name}.sig`))
console.log(
  `Copied ${name} (${(size / 1024 / 1024).toFixed(1)} MB) and its signature to installer/`,
)
