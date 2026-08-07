import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          shell: resolve(__dirname, 'src/preload/shell.ts'),
          service: resolve(__dirname, 'src/preload/service.ts'),
          loading: resolve(__dirname, 'src/preload/loading.ts'),
        },
        // no shared chunks: the sandboxed shell preload cannot require() them
        external: ['electron'],
        output: { format: 'cjs' },
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    optimizeDeps: { include: ['zustand'] },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          loading: resolve(__dirname, 'src/renderer/loading.html'),
        },
      },
    },
  },
});
