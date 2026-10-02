import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import compression from 'vite-plugin-compression';
import { cpSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Root-level runtime assets that pages reference by absolute URL but Vite
// never sees (multi-page HTML keeps them as plain strings). Without this,
// a dist-only deploy 404s on /js/*.js, /theme.css, /bc.mp4, etc.
const RUNTIME_COPY = [
  'js',
  'theme.css',
  'theme.js',
  'ai-widget.js',
  'login-bg.js',
  'three.min.js',
  'STLLoader.js',
  'OrbitControls.js',
  'bc.mp4',
  'video-bg-new.mp4',
  'og-image.svg',
  'favicon.png',
  'favicon.ico',
  'logo.png',
  'logo-nav.png',
  'webfonts',
  '.well-known',
  'admin-supabase',
  '_headers',
  '_redirects',
];

function copyRuntimeAssets() {
  return {
    name: 'copy-runtime-assets',
    apply: 'build',
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      if (!existsSync(outDir)) return;
      for (const rel of RUNTIME_COPY) {
        const from = resolve(__dirname, rel);
        if (!existsSync(from)) continue;
        try {
          cpSync(from, join(outDir, rel), { recursive: true, force: true });
        } catch (err) {
          this.warn(`copy-runtime-assets: failed to copy ${rel}: ${err.message}`);
        }
      }
    },
  };
}

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
        os: '/os.html',
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
        cookies: '/cookies.html',
        notFound: '/404.html',
        offline: '/offline.html',
        adminAccess: '/admin-access.html',
        adminLogin: '/admin-login.html',
        aiHealth: '/ai-health.html',
        apiKeys: '/api-keys.html',
        clientPanel: '/client-panel.html',
        game: '/game.html',
        news: '/news.html',
        notifications: '/notifications.html',
        otpLogin: '/otp-login.html',
        playground: '/playground.html',
        preview: '/preview.html',
        profile: '/profile.html',
        projectPreview: '/project-preview.html',
        realtimeGameBuilder: '/realtime-game-builder.html',
        register: '/register.html',
        resetPassword: '/reset-password.html',
        shop: '/shop.html',
        tools: '/tools.html',
        verifyEmail: '/verify-email.html',
        viewer: '/viewer.html',
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
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
    copyRuntimeAssets()
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
