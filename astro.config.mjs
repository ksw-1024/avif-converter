// @ts-check
import { defineConfig } from 'astro/config';

import relativeLinks from 'astro-relative-links';

// https://astro.build/config
export default defineConfig({
  output: 'static',

  vite: {
      optimizeDeps: {
          exclude: ['@jsquash/avif'],
      },
      worker: {
          format: 'es',
      },
	},

  integrations: [relativeLinks()],
});