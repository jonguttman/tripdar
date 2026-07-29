// `vitest/config` re-exports vite's `defineConfig`, so `vite build` / `vite dev` are
// unaffected — it just types the `test` block below.
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // KEWL-2467: fails any test whose code under test touched an un-stubbed prisma
    // model/method, even when a route catch-all swallowed the throw into a 500.
    setupFiles: ['./src/test/setup.ts'],
  },
})

