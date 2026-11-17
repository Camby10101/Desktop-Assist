// Installer config for electron-builder. JavaScript rather than YAML so the icon can follow the
// TENANT being built, like electron.vite.config.ts does.
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const tenant = process.env.TENANT ?? 'morse-micro'
// The app's icon: the tenant's icon.png if it has one (Morse Micro's is its logo wearing the
// character's hat), otherwise its logo.png.
const icon = ['icon.png', 'logo.png']
  .map((name) => join(__dirname, '../../tenants', tenant, name))
  .find((path) => existsSync(path))

/** @type {import('electron-builder').Configuration} */
module.exports = {
  // Still the ID from when it was called Desktop Assist: Windows knows an install by it, so each
  // new version installs over the old one (see src/main/formerName.ts for what else carries over).
  appId: 'com.morsemicro.desktopassist',
  productName: 'Desktop Wizard',
  directories: { output: 'dist', buildResources: 'build' },
  files: ['out/**', 'package.json'],
  // The install folder is named after the package; without this it would be the npm workspace
  // name, "@desktop-assist/desktop", which becomes "@desktop-assistdesktop".
  extraMetadata: { name: 'desktop-assist' },
  npmRebuild: false,
  // Electron's built-in switches, set in the .exe, as Electron's security checklist recommends.
  // They stop the .exe being used to run other code: as plain Node (ELECTRON_RUN_AS_NODE), with
  // NODE_OPTIONS or with Node's debugger (--inspect); or with a changed app.asar (its checksum
  // is in the .exe, and Electron loads nothing but app.asar). Cookies are encrypted on disk with
  // the Windows account's key. Pages loaded from file:// keep their usual Electron privileges,
  // because the panel is one.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    enableCookieEncryption: true,
  },
  win: {
    // The icon (see above). electron-builder turns it into the .exe's icon, which Windows also
    // shows for the Start menu shortcut, the installer and the uninstaller. Windows icons can't be
    // made from SVG, so a tenant with neither PNG gets Electron's default icon.
    ...(icon ? { icon } : {}),
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-Setup-${version}.${ext}',
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    runAfterFinish: true,
    deleteAppDataOnUninstall: false,
  },
}
