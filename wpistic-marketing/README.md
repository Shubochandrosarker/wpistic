# WPistic marketing site

This Next.js application is a static export for the Cloudflare Workers marketing Worker.

    npm ci
    npm run check:static
    npm run deploy:staging
    npm run deploy:production

The Worker configuration is in wrangler.jsonc. Use Workers Custom Domains; do not create workers.dev CNAME records. See ../docs/CLOUDFLARE_DEPLOYMENT.md.
