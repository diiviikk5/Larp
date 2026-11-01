import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Four pages: home, the Skills marketplace, the Apps and live Memory.
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), skills: resolve(__dirname, 'skills.html'), apps: resolve(__dirname, 'apps.html'), memory: resolve(__dirname, 'memory.html') } } },
});
