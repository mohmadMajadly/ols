import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    // يسمح لحاوية أدوات المراجعة (Playwright) بالوصول لخادم التطوير
    allowedHosts: ['host.docker.internal'],
    // bind mounts على ويندوز لا توصل أحداث تغيير الملفات — المراقبة بالاستطلاع ضرورية
    watch: { usePolling: true, interval: 300 },
    proxy: {
      '/api': {
        target: 'http://backend:8000',
        changeOrigin: true,
        // يلزم لترقية WebSocket على /api/sessions/{id}/track (WP9c — التتبع الصوتي الآني)
        ws: true,
      },
    },
  },
})
