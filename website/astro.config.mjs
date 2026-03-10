import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://plugins.eca.dev',
  outDir: './dist',
  build: {
    assets: '_assets'
  }
});
