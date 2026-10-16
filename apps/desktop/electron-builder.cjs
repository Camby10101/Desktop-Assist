// Installer config for electron-builder. JavaScript rather than YAML so the icon can follow the
// TENANT being built, like electron.vite.config.ts does.
const { existsSync } = require('node:fs')
const { join } = require('node:path')

const tenant = process.env.TENANT ?? 'morse-micro'
const logo = join(__dirname, '../../tenants', tenant, 'logo.png')

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.morsemicro.desktopassist',
  productName: 'Desktop Assist',
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
    // The bubble's logo. electron-builder turns it into the .exe's icon, which Windows also shows
    // for the Start menu shortcut, the installer and the uninstaller. Windows icons can't be made
    // from SVG, so a tenant with only logo.svg gets Electron's default icon.
    ...(existsSync(logo) ? { icon: logo } : {}),
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
