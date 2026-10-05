import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({ plugins: [react(), tailwindcss()], server: { watch: { ignored: ['**/test-results*/**', '**/artifacts/**', '**/services/decision-api/**'] }, port: 4173, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8000' } }, test: { exclude: ['tests/e2e/**', 'node_modules/**'] } })
