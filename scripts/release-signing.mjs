// Signs a release's installer with the release key, so copies of Desktop Assist will run it as an
// update (see docs/RELEASING.md). The key's private half stays on the PC that builds releases,
// never on GitHub, so someone who gets into the GitHub account can't publish an update; the
// tenant's tenant.json has the public half (`updates.publicKey`).
//
//   node scripts/release-signing.mjs key    makes the key, once (`npm run release:key`)
//   node scripts/release-signing.mjs sign   signs apps/desktop/dist/<installer>.exe as
//                                           <installer>.exe.sig (`npm run dist` does this)
//
// The key is %USERPROFILE%\.desktop-assist\release-key.pem, or the file named in the
// DESKTOP_ASSIST_RELEASE_KEY environment variable. It's never printed.

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const KEY =
  process.env.DESKTOP_ASSIST_RELEASE_KEY || join(homedir(), '.desktop-assist', 'release-key.pem')

/** What's signed: the same text as signedText() in apps/desktop/src/main/updates.ts. */
export const signedText = (version, sha256) => `desktop-assist-update ${version} sha256:${sha256}`

/** A key's public half as tenant.json has it: base64 (SPKI). */
export const publicKeyOf = (key) =>
  createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('base64')

/** The signature of an installer for a version, base64, as the `.sig` file has it. */
export function signInstaller(privateKey, version, installer) {
  const sha256 = createHash('sha256').update(installer).digest('hex')
  return sign(null, Buffer.from(signedText(version, sha256)), privateKey).toString('base64')
}

function makeKey() {
  if (existsSync(KEY)) {
    fail(`There's already a release key, ${KEY}. It's never replaced: copies only trust that one.`)
  }
  const { privateKey } = generateKeyPairSync('ed25519')
  mkdirSync(dirname(KEY), { recursive: true })
  writeFileSync(KEY, privateKey.export({ type: 'pkcs8', format: 'pem' }), {
    mode: 0o600,
    flag: 'wx',
  })
  console.log(`Made the release key: ${KEY}`)
  console.log('Keep a copy somewhere safe, such as a password manager. Without it, copies of')
  console.log("Desktop Assist can't be updated from Settings; with it, anyone can sign an update.")
  console.log(`\nIts public half, for "updates": { "publicKey": ... } in tenant.json:`)
  console.log(publicKeyOf(privateKey))
}

function signRelease() {
  const tenantName = process.env.TENANT ?? 'morse-micro'
  const tenant = JSON.parse(readFileSync(join(ROOT, 'tenants', tenantName, 'tenant.json'), 'utf8'))
  if (!tenant.updates) {
    console.log(`${tenantName} doesn't update from GitHub: nothing to sign.`)
    return
  }
  const app = JSON.parse(readFileSync(join(ROOT, 'apps/desktop/package.json'), 'utf8'))
  const installer = join(ROOT, 'apps/desktop/dist', `${app.productName}-Setup-${app.version}.exe`)
  if (!existsSync(installer)) fail(`There's no ${installer} to sign; build it with npm run dist.`)
  if (!existsSync(KEY)) {
    fail(
      `There's no release key at ${KEY}, so the installer isn't signed and copies won't take it ` +
        'as an update. Put the key there (or name it in DESKTOP_ASSIST_RELEASE_KEY) and run ' +
        '"node scripts/release-signing.mjs sign"; see docs/RELEASING.md.',
    )
  }
  const privateKey = createPrivateKey(readFileSync(KEY))
  if (publicKeyOf(privateKey) !== tenant.updates.publicKey) {
    fail(
      `${KEY} isn't the key whose public half is updates.publicKey in ${tenantName}'s tenant.json.`,
    )
  }
  const file = readFileSync(installer)
  const signature = signInstaller(privateKey, app.version, file)
  // Checked as the app checks it, with the public half from tenant.json.
  const sha256 = createHash('sha256').update(file).digest('hex')
  const publicKey = createPublicKey({
    key: Buffer.from(tenant.updates.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  })
  const text = Buffer.from(signedText(app.version, sha256))
  if (!verify(null, text, publicKey, Buffer.from(signature, 'base64')))
    fail('The signature failed its check.')
  writeFileSync(`${installer}.sig`, `${signature}\n`)
  console.log(`Signed: ${installer}.sig (attach it to the release with the installer)`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2]
  if (command === 'key') makeKey()
  else if (command === 'sign') signRelease()
  else fail('Usage: node scripts/release-signing.mjs key|sign')
}
