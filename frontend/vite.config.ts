import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import os from 'node:os'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  cacheDir: path.join(os.tmpdir(), 'urbanfleet-frontend-vite-cache'),
  server: {
    headers: {
      // Google Identity Services returns its credential through a popup.
      // Allow that popup to call window.postMessage back to this app.
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
})
