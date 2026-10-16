# Releasing a new version

Desktop Assist updates itself from this repository's GitHub releases: **Settings → Check for
updates** asks GitHub for the latest release and, if it's newer than the copy that's running,
downloads the installer attached to it, checks it's exactly the file on GitHub, and runs it. The
installer replaces Desktop Assist silently and starts it again; the user's data (preferences, the
text box, sign-ins) is kept.

So a release is: a higher version number, the installer built from it, and a GitHub release with
that installer attached.

## 1. Set the version

In `apps/desktop/package.json`, raise `version`, for example from `1.0.0` to `1.0.1` (fixes),
`1.1.0` (new features) or `2.0.0` (big changes). Or from the repository's folder:

```powershell
npm version 1.0.1 --no-git-tag-version -w apps/desktop
```

The version is what Settings shows at the bottom, what the installer is named after, and what
the app compares with GitHub's latest release: a copy only updates to a **higher** version.

Commit it (with the release's changes) and merge to `main` as usual.

## 2. Build the installer

From `main`, with the version you set:

```powershell
npm run dist
```

This builds `apps/desktop/dist/Desktop Assist-Setup-1.0.1.exe`. Install it once yourself to check
it.

## 3. Publish the release on GitHub

1. On GitHub, open the repository's **Releases** and choose **Draft a new release**.
2. **Choose a tag**: type `v` and the version, e.g. `v1.0.1`, and choose **Create new tag on
   publish**, targeting `main`. The tag must be the version (with or without the `v`); a tag that
   isn't a version (`latest`, `beta`) is ignored by the app.
3. **Title**: e.g. `Desktop Assist 1.0.1`, and a few lines on what's new.
4. **Attach** the installer: drag `Desktop Assist-Setup-1.0.1.exe` into the box. GitHub renames it
   `Desktop.Assist-Setup-1.0.1.exe`; that's fine (the app looks for an `.exe` with "Setup" in its
   name).
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
- It checks the download's size and its SHA-256 against what GitHub reports for the attached file,
  and refuses it (deleting it) if either differs.
- The installer runs as electron-builder's own updater runs it: `--updated /S --force-run`
  (an update, silently, starting the app again afterwards). It waits for Desktop Assist to close,
  which it does as soon as the installer has started.
- In a development run (`npm run dev`) it downloads and checks the installer but never runs it;
  the log says what an installed copy would have run.

The installer isn't code-signed yet, so Windows can't tell users who made it. The check against
GitHub's SHA-256 makes sure the file is the one attached to the release; signing (a candidate in
[PLAN.md](PLAN.md) §8) would also prove who built it.

## Troubleshooting

- **"Up to date" but there's a newer release**: check the release isn't a draft or pre-release, its
  tag is a version (`v1.0.1`), and the `.exe` is attached. The copy compares versions, so check the
  release's version is higher than the one at the bottom of Settings.
- **"The download isn't the release's file"**: the download was cut short or changed on the way
  (some proxies do); try again. If it keeps happening, re-upload the installer to the release.
- **"Couldn't reach GitHub"**: the PC is offline, or a firewall blocks `api.github.com`,
  `github.com` or `objects.githubusercontent.com` (where GitHub serves release files from).
- The log (`%APPDATA%\Desktop Assist\logs\desktop-assist.log`) has the details of anything that
  failed.
