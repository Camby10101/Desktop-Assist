import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

// TENANT picks which tenants/<id> folder (branding + enabled actions) is bundled into the build.
const tenant = process.env.TENANT ?? 'morse-micro'

const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@tenant': resolve(__dirname, '../../tenants', tenant),
}

// Everything is bundled: runtime libraries live in devDependencies, so the installer ships no
// node_modules (electron-vite only externalizes `dependencies`).
export default defineConfig({
  main: { resolve: { alias } },
  preload: { resolve: { alias } },
  renderer: { resolve: { alias }, plugins: [react(), tailwindcss()] },
})
