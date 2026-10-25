import { defineConfig } from 'astro/config';

// Project site on GitHub Pages: https://santiagogarza.github.io/university-of-mars/
export default defineConfig({
  site: 'https://santiagogarza.github.io',
  base: '/university-of-mars',
  trailingSlash: 'always',
  output: 'static',
  build: {
    format: 'directory',
  },
  compressHTML: true,
});
