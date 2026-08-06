import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';

// Two deployment targets, one codebase:
//   - Cloudflare Workers (default): `astro build`
//   - Self-hosted VPS:              `ASTRO_ADAPTER=node astro build`
// The node build is served by `node dist/server/entry.mjs` inside the
// self-hosted image (docker/Dockerfile.node, role `admin`). The runtime env
// shim for `locals.runtime.env` lives in src/middleware.ts.
const selfHosted = process.env.ASTRO_ADAPTER === 'node';

export default defineConfig({
  output: 'server',
  adapter: selfHosted
    ? node({ mode: 'standalone' })
    : cloudflare({ platformProxy: { enabled: true } }),
  integrations: [react(), tailwind({ applyBaseStyles: false })],
  server: { port: 4321 },
  ...(selfHosted
    ? {
        vite: {
          ssr: {
            // Bundle everything into dist/ so the runtime image does not need
            // the workspace node_modules tree.
            noExternal: true,
          },
        },
      }
    : {}),
});
