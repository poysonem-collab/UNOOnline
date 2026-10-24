import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any URL, e.g. GitHub Pages' /uno-online/.
  base: './',
  server: {
    // In development the game server runs separately (npm run dev starts both).
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
