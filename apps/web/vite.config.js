import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const proxy = {};
for (const path of ['/pv/api/auth', '/pv/api/admin/users', '/pv/api/admin/health', '/pv/api/admin/flows', '/pv/api/workbench/directory', '/pv/api/approvals']) {
  proxy[path] = { target: 'http://127.0.0.1:7101', changeOrigin: true };
}
for (const path of ['/pv/api/workbench/projects', '/pv/api/workbench/devices', '/pv/api/workbench/tickets']) {
  proxy[path] = { target: 'http://127.0.0.1:7103', changeOrigin: true };
}
for (const path of ['/pv/api/workbench/finance', '/pv/api/workbench/payments', '/pv/api/workbench/adjustments', '/pv/api/workbench/compensation-config', '/pv/api/workbench/settlements', '/pv/api/workbench/ledger']) {
  proxy[path] = { target: 'http://127.0.0.1:7104', changeOrigin: true };
}
proxy['/pv/api/workbench'] = { target: 'http://127.0.0.1:7102', changeOrigin: true };
for (const path of ['/pv/api/products', '/pv/api/config', '/pv/api/geo', '/pv/api/cases', '/pv/skill']) {
  proxy[path] = { target: 'http://127.0.0.1:7102', changeOrigin: true };
}
proxy['/pv/api/health'] = { target: 'http://127.0.0.1:7101', changeOrigin: true };

export default defineConfig({
  plugins: [vue()],
  base: '/pv/',
  server: { port: 5173, proxy },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node' },
});
