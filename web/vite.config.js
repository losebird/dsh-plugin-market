import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',
  plugins: [react()],
  // App.jsx imports the shared collapse helper from ../../scripts
  server: { fs: { allow: ['..'] } },
})
