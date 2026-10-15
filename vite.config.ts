import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { modsApi } from './server/modsApi.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), modsApi()],
})
