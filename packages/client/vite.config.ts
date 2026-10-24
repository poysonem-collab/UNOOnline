import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works from any URL, e.g. GitHub Pages' /uno-online/.
  base: './',
});
