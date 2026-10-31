import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Three pages: home, the Skills marketplace and the Apps.
export default defineConfig({
  base: './',
  build: { rollupOptions: { input: { main: resolve(__dirname, 'index.html'), skills: resolve(__dirname, 'skills.html'), apps: resolve(__dirname, 'apps.html') } } },
});
