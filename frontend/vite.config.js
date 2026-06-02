import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Local dev proxy — only active when running `npm run dev`
    // Points /api-backend → your live Strapi so you can dev without CORS issues
    proxy: {
      '/api-backend': {
        target: 'https://chama.laitor.co.ke',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-backend/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
