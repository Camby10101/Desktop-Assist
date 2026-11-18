# Part 7 — From code to the PCs

The last piece is how the code becomes an installer, and how each copy of the app finds and
installs the next one. `docs/RELEASING.md` has the step-by-step checklist; this part explains what
each step does.

## 36. The overall flow

```figure
release
```

1. **Raise the version**: `npm version 2.4.2 --no-git-tag-version -w apps/desktop` changes
   `apps/desktop/package.json`. That number is what `app.getVersion()` reports, so it's what the
   updater compares.
2. **Build and sign**: `npm run dist`, which runs, in order: the type check, `electron-vite build`
   (the three parts compiled into `apps/desktop/out/`), `electron-builder --win` (the installer, in
   `apps/desktop/dist/`), `scripts/release-signing.mjs sign` (the `.sig` file), and
   `scripts/publish-installer.mjs` (a copy of both in `installer/`).
3. **Commit and push**, with the new `installer/`, so the newest installer can be downloaded from the
   repository's main page.
4. **Publish a GitHub release** tagged with the version, with the `.exe` and the `.exe.sig` attached.
   From then on, every copy's Check for updates finds it (section 33).

## 37. electron-vite: building the app

`electron.vite.config.ts` builds the three parts separately: the main process and the preload for
Node, the pages for Chromium (with React and Tailwind). It defines two import shortcuts used
everywhere, `@shared` for `src/shared` and `@tenant` for `tenants/<TENANT>`, so the build bakes in
exactly one tenant, chosen by the `TENANT` environment variable (`morse-micro` if it isn't set).
`npm run dev` runs the same build in watch mode, reloading the pages as you save.

## 38. electron-builder: the installer

`electron-builder.cjs` packs `out/` into a per-user, one-click NSIS installer,
`Desktop Wizard-Setup-<version>.exe`, with the tenant's `icon.png` as the program's icon. It keeps
only the English languages Chromium ships with and compresses at maximum, which keeps the installer
under GitHub's 100 MB limit for files in a repository. Its **fuses** switch features off inside the
`.exe` itself:

```js
electronFuses: {
  runAsNode: false, // the .exe can't be used as a plain Node.js
  enableNodeOptionsEnvironmentVariable: false, // NODE_OPTIONS can't inject code
  enableNodeCliInspectArguments: false, // --inspect and friends do nothing
  enableEmbeddedAsarIntegrityValidation: true, // the packed app is checked before it runs
  onlyLoadAppFromAsar: true, // and nothing else is loaded in its place
  enableCookieEncryption: true,
},
```

> **Security**
> A fuse is set when the `.exe` is built and can't be changed by an environment variable or a switch
> afterwards. Together with `debugging.ts`'s refusal to start (section 22), another program on the PC
> can't turn the installed app into a tool for running its own code with the user's sign-ins.

The app ID, `com.morsemicro.desktopassist`, and the install folder keep the app's old name: changing
them would make Windows treat a new version as a different app, and updates would install beside the
old copy instead of over it.

## 39. Signing and publishing

#### `scripts/release-signing.mjs`

`npm run release:key` makes the release key once: an Ed25519 key pair. The private half is saved to
`%USERPROFILE%\.desktop-assist\release-key.pem` (never in the repository, never printed); the public
half is printed, for `tenant.json`'s `updates.publicKey`. `sign` then signs each installer:

```js
/** The signature of an installer (its bytes) for a version, base64, as the `.sig` file has it. */
export function signInstaller(privateKey, version, installer) {
  const sha256 = createHash('sha256').update(installer).digest('hex')
  return sign(null, Buffer.from(signedText(version, sha256)), privateKey).toString('base64')
}
```

`signedText` is the same text the app checks (section 22): the version and the installer's SHA-256.
Before signing, the script checks the key really is the one whose public half is in `tenant.json`;
after, it checks the signature exactly as the app will. A release can't go out signed with the wrong
key. `npm run release:key` refuses to replace an existing key: copies trust only that one.

#### `scripts/publish-installer.mjs`

Copies the new installer and its signature into `installer/`, removing older ones, and stops (copying
nothing) if the installer is 100 MB or more, which GitHub would refuse.

> **Why it's built this way**
> The signature is checked against a key that lives only on the PC that builds releases, not against
> anything on GitHub. GitHub could be fooled or broken into; the signature can't be forged without
> the private key. GitHub's own SHA-256 is checked too, but on its own it only proves the file
> arrived intact, not who made it.

> **Good to know**
> The updater ignores a release without both files attached, and if the newest version has no
> installer yet, Settings says so rather than claiming this copy is up to date. Attach both files
> before telling anyone a release is out.
