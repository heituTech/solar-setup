import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  base: '/erp/',
  server: {
    port: 5273,
    proxy: {
      '/erp/api': { target: 'http://127.0.0.1:7200', changeOrigin: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
