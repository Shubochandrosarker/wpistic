# VPS deployment

WPistic's complete control plane can run on one Docker host behind a Cloudflare
Tunnel. Cloudflare Workers remain a supported deployment target, but they are
not required for the API, account service, customer dashboard, or admin portal.
No application service publishes a host port.

## 1. Prerequisites

- A Linux VPS with Docker Engine and Docker Compose v2.
- A Cloudflare-managed domain and a `cloudflared` tunnel connected to the
  external Docker network named `wpistic`.
- Node.js 20 or newer on the operator machine for secret generation.

Clone the repository, then work from `wpistic-platform`:

```sh
cp .env.vps.example .env.vps
npm run vps:secrets
```

Complete every blank value in `.env.vps`. Keep `BILLING_MODE=FREE_ONLY` until
an authorized payment administrator has configured and tested Stripe. Set
`EMAIL_WEBHOOK_URL` before relying on automated invitations or password reset
delivery.

## 2. Tunnel routes

Attach `cloudflared` to the `wpistic` network and configure these public
hostname services:

| Public hostname | Tunnel service |
| --- | --- |
| `api.example.com` | `http://api:8787` |
| `account.example.com` | `http://account:8788` |
| `app.example.com` | `http://dashboard:8080` |
| `admin.example.com` | `http://admin:4321` |

The marketing site can be routed to its own container. Route both the apex and
`www` hostname, or redirect `www` to the apex. Do not expose container ports as
a workaround: direct ingress would allow clients to forge Cloudflare forwarding
headers used by rate limiting.

Remove conflicting Worker custom domains and stale A/AAAA records before
cutover. Configuration rules that enable a JavaScript challenge and Bot Fight
Mode can block JSON clients; validate the applicable Cloudflare security rules
for the API and identity hostnames.

## 3. Deploy and verify

```sh
npm run vps:up
npm run vps:ps
npm run vps:logs
```

The migration container must complete successfully before the long-running
services start. Run exactly one scheduler. Verify through the public hostnames,
not by publishing temporary ports:

```sh
curl -fsS https://api.example.com/health
curl -fsS https://account.example.com/health
curl -fsS https://account.example.com/.well-known/openid-configuration
curl -fsSI https://app.example.com/licenses
curl -fsSI https://admin.example.com/login
```

The dashboard server deliberately falls back to `index.html`, so SPA deep links
such as `/licenses` remain refreshable. Versioned assets under `/assets` receive
immutable caching; documents do not.

## 4. First owner login and backup

1. Register at the account service with an address listed in `ADMIN_EMAILS`.
2. Enrol MFA. Owner accounts have no MFA bypass.
3. Sign in to the admin portal and confirm the expected role.
4. Take a backup before onboarding customers:

   ```sh
   npm run vps:backup
   ```

5. Restore that backup into an isolated environment and verify its database and
   blob contents. A backup that has not been restore-tested is not sufficient.

## 5. Routine operations

```sh
npm run vps:ps
npm run vps:logs
npm run vps:up
npm run vps:down
npm run vps:backup
```

`vps:up` rebuilds the shared image and recreates changed services. The named
Postgres and blob volumes persist across ordinary compose recreation. Include
both volumes in the backup and retention plan.
