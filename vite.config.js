import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';

// Auto-discover all HTML files for multi-page app mode
const htmlFiles = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));
const input = {};
for (const f of htmlFiles) {
  input[f.replace('.html', '')] = resolve(__dirname, f);
}

export default defineConfig({
  root: __dirname,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input,
    },
    minify: 'esbuild',
    sourcemap: false,
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },
  publicDir: 'public',
});
