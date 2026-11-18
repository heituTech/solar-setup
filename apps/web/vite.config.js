import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';

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

// base 为 /pv/ 时，访问 /pv 需重定向到 /pv/（dev / preview 与线上 nginx 行为保持一致）
function baseTrailingSlashPlugin() {
  const redirect = (req, res, next) => {
    if (req.url === '/pv' || req.url.startsWith('/pv?')) {
      res.writeHead(301, { Location: `/pv/${req.url.slice(3)}` });
      res.end();
      return;
    }
    next();
  };
  return {
    name: 'base-trailing-slash-redirect',
    configureServer(server) {
      server.middlewares.use(redirect);
    },
    configurePreviewServer(server) {
      server.middlewares.use(redirect);
    },
  };
}

export default defineConfig({
  plugins: [vue(), baseTrailingSlashPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  base: '/pv/',
  server: { port: 5173, proxy },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { environment: 'node' },
});
