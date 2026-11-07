import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';

// https://astro.build/config
export default defineConfig({
  server: {
    host: true,
    port: process.env.PORT ? parseInt(process.env.PORT, 10) : 4321,
  },
  integrations: [tailwind({
    applyBaseStyles: false,
  })],
});
