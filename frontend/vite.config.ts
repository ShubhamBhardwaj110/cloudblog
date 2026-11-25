import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Syntax highlighting changes rarely: its own long-cached chunk. Auth/editor code is split
        // automatically into the lazily-loaded admin chunk.
        manualChunks(id) {
          if (id.includes('highlight.js')) return 'highlight';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
