import { defineConfig } from 'vite'

// Use relative paths so the built site works when hosted from a subfolder
// (common with shared hosting file managers), not only from domain root.
export default defineConfig({
  base: './',
})
