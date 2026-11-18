import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Relative base so the same build runs from GitHub Pages, a USB stick or file server at a booth.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        board: resolve(__dirname, 'board.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
