# Releasing a new version

Desktop Assist updates itself from this repository's GitHub releases: **Settings → Check for
updates** asks GitHub for the latest release and, if it's newer than the copy that's running,
downloads the installer attached to it, checks it's exactly the file on GitHub and that it's
signed with the release key, and runs it. The installer replaces Desktop Assist silently and
starts it again; the user's data (preferences, the text box, sign-ins) is kept.

So a release is: a higher version number, the installer built from it and signed with the release
key, and a GitHub release with both files attached.

## The release key

Copies of Desktop Assist only install an update signed with the **release key**. The key has two
halves:

- The **public half** is in `tenant.json` (`updates.publicKey`), so it's inside every copy. It can
  only check signatures, so it doesn't need hiding.
- The **private half** signs releases. It's a file on the PC that builds them,
  `%USERPROFILE%\.desktop-assist\release-key.pem`, and it never goes on GitHub.

That's the point of it: someone who gets into the GitHub account can publish a release, but every
copy refuses to install it, because they don't have the private half.

- **Keep a copy of the file** somewhere safe that isn't GitHub, such as IT's password manager (the
  file's contents as a secure note). Anyone with the file can sign updates, so treat it like a
  password.
- **Building on another PC**: put the file in the same place there, or anywhere you like and name
  it in the `DESKTOP_ASSIST_RELEASE_KEY` environment variable.
- **Making the key** (done once, for 1.0.0): `npm run release:key` makes the file and prints its
  public half for `tenant.json`. It never replaces an existing key.
- **If the key is lost or leaks**: move the old file away, run `npm run release:key`, put the new
  public half in `tenant.json`, and release. Copies that know the old key can't take that release
  from Settings, so install it on them by hand once (or through JumpCloud); from then on they
  update with the new key as usual.

## 1. Set the version

In `apps/desktop/package.json`, raise `version`, for example from `1.0.0` to `1.0.1` (fixes),
`1.1.0` (new features) or `2.0.0` (big changes). Or from the repository's folder:

```powershell
npm version 1.0.1 --no-git-tag-version -w apps/desktop
```

The version is what Settings shows at the bottom, what the installer is named after, and what
the app compares with GitHub's latest release: a copy only updates to a **higher** version.

Commit it (with the release's changes) and merge to `main` as usual.

## 2. Build and sign the installer

From `main`, with the version you set, on the PC with the release key:

```powershell
npm run dist
```

This builds `apps/desktop/dist/Desktop Assist-Setup-1.0.1.exe` and signs it: next to it is
`Desktop Assist-Setup-1.0.1.exe.sig`, the signature. The signing step first checks the key is the
one whose public half is in `tenant.json`.

If the key isn't on the PC, the build stops at signing and says so. The installer is still built,
but copies won't take it as an update until it's signed; put the key in place and run
`node scripts/release-signing.mjs sign`.

Install it once yourself to check it.

## 3. Publish the release on GitHub

1. On GitHub, open the repository's **Releases** and choose **Draft a new release**.
2. **Choose a tag**: type `v` and the version, e.g. `v1.0.1`, and choose **Create new tag on
   publish**, targeting `main`. The tag must be the version (with or without the `v`); a tag that
   isn't a version (`latest`, `beta`) is ignored by the app.
3. **Title**: e.g. `Desktop Assist 1.0.1`, and a few lines on what's new.
4. **Attach both files**: drag `Desktop Assist-Setup-1.0.1.exe` and
   `Desktop Assist-Setup-1.0.1.exe.sig` into the box. GitHub renames them
   `Desktop.Assist-Setup-1.0.1.exe` and `Desktop.Assist-Setup-1.0.1.exe.sig`; that's fine (the app
   looks for an `.exe` with "Setup" in its name, and the file of the same name plus `.sig`).
5. Leave **Set as a pre-release** and **Save as draft** unticked (the app ignores both), and
   **Publish release**.

From then on, **Check for updates** on any older copy finds it.

## How the app checks

- It reads `https://api.github.com/repos/Camby10101/Desktop-Assist/releases/latest` (from
  `updates.repo` in `tenant.json`). The repository is public, so no sign-in or token is needed.
  GitHub allows each network address 60 such requests an hour, which the occasional click never
  comes near; if it's ever reached, the app says GitHub is busy.
- It only downloads from the repository's own release files
  (`https://github.com/Camby10101/Desktop-Assist/releases/download/…`).
- It checks the download's size and its SHA-256 against what GitHub reports for the attached file.
- It checks the `.sig` is the release key's signature of this version and the installer's
  SHA-256. Signing the version too means an old, genuine installer can't be passed off as a newer
  release. A release without a valid signature is never installed: the download is deleted and
  Settings says "Didn't install 1.0.1. It isn't signed with the release key…".
- The installer runs as electron-builder's own updater runs it: `--updated /S --force-run`
  (an update, silently, starting the app again afterwards). It waits for Desktop Assist to close,
  which it does as soon as the installer has started.
- In a development run (`npm run dev`) it downloads and checks the installer but never runs it;
  the log says what an installed copy would have run.

## Keeping releases safe

The release key means a GitHub account that's been broken into can't push an update on its own.
The account still controls the code and the releases people download by hand, so also:

- **Turn on two-factor authentication** for every GitHub account that can publish releases on
  the repository (GitHub → Settings → Password and authentication).
- **Keep the list of people with write access short** (the repository's Settings →
  Collaborators). Anyone with write access can publish releases.
- **Consider moving the repository to a Morse Micro GitHub organisation**, so IT controls who has
  access. GitHub redirects the old address after a transfer, so existing copies keep finding
  releases; change `updates.repo` in the next release anyway.
- **Code signing** the installer with a certificate ([PLAN.md](PLAN.md) §8) would also stop Windows
  warning that it's from an unknown publisher.

### What's locked down in the .exe

Nothing to do when releasing; listed here so it isn't undone by accident. `electron-builder.cjs`
sets Electron's _fuses_, switches built into the `.exe`:

- It can't be run as plain Node (`ELECTRON_RUN_AS_NODE`), and ignores `NODE_OPTIONS` and Node's
  debugger switches (`--inspect`).
- It only loads `app.asar`, and checks it against a checksum stored in the `.exe`, so a changed
  copy of the app's code isn't run.
- Cookies are encrypted on disk with the Windows account's key.

And an installed copy refuses to start with Chromium's remote debugging switched on
(`--remote-debugging-port`, `--remote-debugging-pipe`); `src/main/debugging.ts` has the list. Both
together mean another program on the PC can't use Desktop Assist to run its own code or to drive
the app's pages. Because of this, Playwright and debuggers can't attach to an installed copy: test
with `npm run dev` or the built `out/` folder, as the automated tests do.

## Troubleshooting

- **"Up to date" but there's a newer release**: check the release isn't a draft or pre-release, its
  tag is a version (`v1.0.1`), and the `.exe` is attached. The copy compares versions, so check the
  release's version is higher than the one at the bottom of Settings.
- **"Didn't install … It isn't signed with the release key"**: the `.sig` isn't attached ("the
  release has no signature"), or it was made for another file, version or key ("its signature
  doesn't match"). Build and sign again on the PC with the release key, and attach both files from
  the same build.
- **"The download isn't the release's file"**: the download was cut short or changed on the way
  (some proxies do); try again. If it keeps happening, re-upload the installer to the release.
- **"Couldn't reach GitHub"**: the PC is offline, or a firewall blocks `api.github.com`,
  `github.com` or `objects.githubusercontent.com` (where GitHub serves release files from).
- The log (`%APPDATA%\Desktop Assist\logs\desktop-assist.log`) has the details of anything that
  failed.
