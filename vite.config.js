import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import compression from 'vite-plugin-compression';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    minify: 'esbuild',
    sourcemap: false,
    cssCodeSplit: true,
    cssMinify: true,
    chunkSizeWarningLimit: 600,
    esbuild: { drop: ['console', 'debugger'] },
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'cinematic': ['src/cinematic/index.js']
        }
      }
    }
  },
  plugins: [
    glsl(),
    compression({ algorithm: 'gzip', ext: '.gz' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' })
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src',
      '@cinematic': '/src/cinematic',
      '@acts': '/src/acts',
      '@shaders': '/src/shaders',
      '@ui': '/src/ui',
      '@api': '/src/api',
      '@utils': '/src/utils'
    }
  }
});