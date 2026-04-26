import { defineConfig } from 'vite';

// 静的 HTML / プレーン JS のまま配信。HMR 有効、ポート 5173 デフォルト
export default defineConfig({
  root: '.',
  publicDir: false,
  server: {
    port: 5173,
    open: true,
    host: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  }
});
