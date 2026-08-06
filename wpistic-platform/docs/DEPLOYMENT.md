# Cloudflare deployment entrypoint

Use ../../docs/CLOUDFLARE_DEPLOYMENT.md as the canonical Cloudflare Workers guide. This repository uses npm, not pnpm. The VPS plus Cloudflare Tunnel path remains in VPS_DEPLOYMENT.md and must not share production hostnames with Workers.

The old guide contained pnpm commands, implicit production deployments, and workers.dev CNAME instructions. Those are intentionally removed. Use the provisioning utility, explicit Wrangler environments, Workers Custom Domains, the database gate, and the GitHub workflow.
