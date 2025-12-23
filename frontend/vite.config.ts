import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/cricket-management/', // GitHub Pages base path
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunk - React, Zustand, etc.
          vendor: ['react', 'react-dom', 'zustand'],
          // Game data chunk - players and teams (can be replaced with API later)
          'game-data': [
            './src/data/players.ts',
            './src/data/teams.ts',
          ],
        },
      },
    },
    // Increase warning limit slightly since we're chunking now
    chunkSizeWarningLimit: 600,
  },
})
