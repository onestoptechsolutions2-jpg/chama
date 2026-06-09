import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

// Plugin to copy PWA assets to dist
const pwaCopy = {
  name: 'pwa-copy',
  closeBundle() {
    try {
      mkdirSync(resolve(__dirname, 'dist/icons'), { recursive: true })
      copyFileSync(resolve(__dirname, 'sw.js'),          resolve(__dirname, 'dist/sw.js'))
      copyFileSync(resolve(__dirname, 'manifest.json'),  resolve(__dirname, 'dist/manifest.json'))
      const icons = ['icon-192.png','icon-512.png']
      icons.forEach(f => {
        try { copyFileSync(resolve(__dirname, `icons/${f}`), resolve(__dirname, `dist/icons/${f}`)) } catch {}
      })
    } catch {}
  }
}

export default defineConfig({
  plugins: [react(), pwaCopy],
  server: {
    port: 5173,
    // In dev, proxy all /api calls to the Express backend
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
