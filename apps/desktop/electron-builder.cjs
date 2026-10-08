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
  npmRebuild: false,
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
