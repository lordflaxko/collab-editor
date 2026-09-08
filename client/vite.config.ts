import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Lets the dev server accept requests through a tunnel's public
    // hostname (e.g. localtunnel/ngrok), which Vite otherwise rejects by
    // default since the Host header won't match localhost.
    allowedHosts: true,
  },
})
