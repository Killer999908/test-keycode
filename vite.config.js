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
      input: {
        main: '/index.html',
        pricing: '/pricing.html',
        works: '/gallery.html',
        blog: '/blog.html',
        docs: '/docs.html',
        login: '/login.html',
        signup: '/signup.html',
        dashboard: '/dashboard.html',
        aiBuilder: '/ai-builder.html',
        gameBuilder: '/game-builder.html',
        scan3d: '/scan-3d.html',
        controlPanel: '/control-panel.html',
        adminPanel: '/admin-panel.html',
        checkout: '/checkout.html',
        status: '/status.html',
        changelog: '/changelog.html',
        downloads: '/downloads.html',
        deployments: '/deployments.html',
        support: '/support.html',
        terms: '/terms.html',
        privacy: '/privacy.html',
        cookies: '/cookies.html'
      },
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