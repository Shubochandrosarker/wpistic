import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * Vite build for the WPistic dashboard.
 *
 * Outputs a manifest into build/ which the PHP Assets class reads to resolve
 * the hashed entry chunk + its CSS. No HTML is emitted — WordPress serves the
 * mount template.
 */
export default defineConfig({
  plugins: [react()],
  base: '', // Asset URLs are resolved by WordPress, not relative HTML.
  build: {
    outDir: 'build',
    emptyOutDir: true,
    manifest: 'manifest.json',
    rollupOptions: {
      input: resolve(__dirname, 'src/app/main.jsx'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: false,
  },
});
