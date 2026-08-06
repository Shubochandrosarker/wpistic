# Self-hosted deployment — VPS + Cloudflare Tunnel

Audience: whoever runs the server, and any agent doing it on their behalf.

This deploys the WPistic control plane on your own VPS, reached through a
Cloudflare Tunnel. No Cloudflare Workers account, no Hyperdrive, no KV, no R2,
no Queues.

---

## 1. What changed, and what did not

**Application code did not change.** The API, the identity service, the admin
portal and the dashboard are the same code that runs on Workers. What changed is
what sits behind the bindings:

| Cloudflare | Self-hosted | Notes |
|---|---|---|
| Hyperdrive | Postgres connection pool | One long-lived pool per process instead of a client per request. |
| KV (`SESSION_CACHE`, `PKCE_STORAGE`) | `kv_store` table | Strongly consistent, unlike KV. Expiry enforced on read, so a lapsed step-up window can never come back because cleanup was slow. |
| R2 (`UPDATE_PACKAGES`) | Disk volume or S3 | Bytes on a volume, metadata in Postgres. |
| Queues (`EVENT_BUS`) | `event_outbox` + scheduler | The outbox already existed; the scheduler drains it and runs the same handlers. |
| Cron Triggers | `scheduler` container | One process on a timer. |
| Native rate limiter | `rate_limit_bump()` in Postgres | A single atomic statement. Correct across processes — see §7. |

Both targets stay supported. `npm run deploy:api` still deploys to Workers; the
adapters are additive.

---

## 2. Prerequisites

- A VPS with Docker and the Compose plugin. 2 GB RAM is enough to start.
- A `cloudflared` tunnel you control, running on the same host.
- Four hostnames on a domain in your Cloudflare account:
  `api.`, `account.`, `app.`, `admin.`

> **Before you start:** confirm your tunnel is genuinely running. A container
> named `cloudflared-*` is not proof — some community images ship a *setup web
> UI* and no tunnel process. Check for a real one:
>
> ```bash
> docker ps --format '{{.Names}}\t{{.Image}}' | grep -i cloudflare
> docker exec <container> ps aux | grep -c '[c]loudflared tunnel'   # expect >= 1
> docker exec <container> printenv | grep -c TUNNEL_TOKEN           # expect 1
> ```
>
> If the process count is 0 or there is no token, you have a setup UI rather
> than a tunnel. Fix that first — and see §8, because an exposed setup UI is
> itself a serious problem.

---

## 3. Deploy

```bash
git clone <your repo> && cd wpistic/wpistic-platform

# 1. Configuration
cp .env.vps.example .env.vps
npm run vps:secrets          # prints generated secrets — paste them in
$EDITOR .env.vps             # set the four PUBLIC_* URLs and ADMIN_EMAILS

# 2. Bring it up. Migrations run first; services wait for them to succeed.
npm run vps:up

# 3. Watch it settle
npm run vps:ps
npm run vps:logs
```

Four containers plus a one-shot migrate job. **None publishes a port to the
host** — that is deliberate, see §7.

### Point the tunnel at it

Attach `cloudflared` to the `wpistic` network so it can resolve the services by
name:

```bash
docker network connect wpistic <your-cloudflared-container>
```

Then map the hostnames in your tunnel's ingress:

| Hostname | Service |
|---|---|
| `api.example.com` | `http://api:8787` |
| `account.example.com` | `http://account:8788` |
| `app.example.com` | the dashboard SPA — see below |
| `admin.example.com` | the admin portal — see below |

If `cloudflared` runs in its own compose project, declare the network there:

```yaml
networks:
  wpistic:
    external: true
```

### The two front ends

`api` and `account` are servers and are handled above. The other two are not:

- **`app.` (customer dashboard)** is a static SPA. `docker/Dockerfile.node`
  builds it to `/app/dashboard` inside the image. Serve that directory with any
  static host, and make sure unknown paths fall back to `index.html` — the SPA
  routes client-side, and without that fallback a refresh on `/licenses`
  returns 404.
- **`admin.` (staff portal)** is Astro SSR currently built for the Cloudflare
  adapter. To self-host it, switch `apps/admin/astro.config.mjs` to
  `@astrojs/node` and run `node ./dist/server/entry.mjs`. Until you do, the
  admin portal is the one piece that still needs Cloudflare — everything else
  runs on your VPS today.

---

## 4. First-run checklist

In order. Each step depends on the one before it.

1. **`npm run vps:ps`** — `postgres`, `api`, `account`, `scheduler` up;
   `migrate` exited 0. If `migrate` failed, nothing else started: read its logs.
2. **Health, from inside the network** (nothing is exposed to the host):
   ```bash
   docker compose --env-file .env.vps -f docker-compose.vps.yml exec api \
     curl -fsS http://localhost:8787/health
   docker compose --env-file .env.vps -f docker-compose.vps.yml exec account \
     curl -fsS http://localhost:8788/health
   ```
3. **Through the tunnel:** `curl https://api.example.com/health` and
   `https://account.example.com/.well-known/openid-configuration`. The `issuer`
   in that document must exactly equal your `PUBLIC_ACCOUNT_URL`. If it does
   not, every login will fail with an invalid-issuer error.
4. **Catalog:** the public catalog should be 15 products with `ffl-checkout` on
   compliance hold.
   ```bash
   docker compose --env-file .env.vps -f docker-compose.vps.yml exec postgres \
     psql -U wpistic -d wpistic -c \
     "SELECT count(*) FROM products WHERE public_visibility AND catalog_state <> 'draft';"
   ```
5. **Create your account** at `https://account.example.com/register`, using the
   address in `ADMIN_EMAILS`.
6. **Enrol MFA.** Every admin mutation requires it and there is no bypass,
   including for the owner.
7. **Open `admin.` and unlock.** The header should read "🔒 Changes locked";
   your authenticator code turns it into a 15-minute window.
8. **Take a backup and restore it somewhere** before you have customers:
   `npm run vps:backup`. See §6.

---

## 5. Operating it

```bash
npm run vps:logs                        # follow everything
npm run vps:ps                          # health at a glance
npm run vps:down                        # stop (volumes survive)
npm run vps:up                          # redeploy after a git pull
npm run vps:backup                      # database + packages
```

Redeploying re-runs migrations and re-applies seeds. Seeds are idempotent, so
this is safe and picks up catalog corrections shipped since your last release.

**Scale-out caveat:** you can run more than one `api` and `account` container —
the rate limiter and all caches are in Postgres, so they coordinate correctly.
Run exactly **one** `scheduler`. A second would not corrupt anything (the outbox
uses `FOR UPDATE SKIP LOCKED`, the expiry sweep is idempotent) but it would only
contend for the same rows.

---

## 6. Backups

Two things cannot be rebuilt from git:

1. **The database** — customers, licenses, organizations, audit history.
2. **The blob volume** — the plugin `.zip` files customers download.

A database-only backup restores a platform that knows about every license and
cannot serve a single update. Back up both.

```bash
npm run vps:backup           # writes ./backups/wpistic-{db,blobs}-<stamp>
```

Then, and this is the part people skip: **copy them off the VPS**, and restore
one into a scratch database at least once. A backup you have never restored is a
guess.

```bash
gunzip -c backups/wpistic-db-<stamp>.sql.gz | psql "$SCRATCH_DATABASE_URL"
```

---

## 7. Security notes specific to self-hosting

### Nothing is published to the host, on purpose

The API resolves a caller's IP from `CF-Connecting-IP`, falling back to
`X-Forwarded-For`. On Cloudflare those headers are set by the edge and cannot be
forged. **On a VPS, anything that can open a socket to the container can send
whatever it likes.** A directly reachable port would let a caller spoof an IP,
evade rate limiting, and poison another customer's bucket.

Keeping every service on an internal Docker network means the only path in is
`cloudflared` — which is what makes those headers trustworthy again.

If you publish a port to debug, bind it to `127.0.0.1`, never `0.0.0.0`:

```yaml
ports: ['127.0.0.1:8787:8787']    # correct
ports: ['8787:8787']              # wrong — reachable from the internet
```

### The database is not exposed either

Postgres is on the internal network only. Reach it with
`docker compose exec postgres psql -U wpistic -d wpistic`, not by opening 5432.

### Secrets

`.env.vps` holds live credentials and is gitignored. Rotating `MFA_ENC_KEY`
invalidates every enrolled authenticator, including yours — you would need
database access to recover. Rotating `LICENSE_SIGNING_SECRET` invalidates every
offline signature customers' plugins hold, so they all fall back to online
validation until they refresh.

### Staff access

`ADMIN_EMAILS` empty means nobody can reach the admin API. That is the safe
default and also the reason a fresh deploy has an inaccessible panel until you
set it.

---

## 8. If the audit in your Docker panel is accurate

A review of this VPS reported two findings worth acting on **before** deploying
anything else. Verify them yourself rather than taking either report on faith:

**An unauthenticated tunnel-setup UI on `0.0.0.0:14333`.** If a
`cloudflared-web`-style container is serving a setup UI on a public interface,
anyone who reaches that port can create a tunnel into your network. A cloud
firewall in front of it is one control, not two.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://<vps-ip>:14333/    # 000 = good
```

If it answers, either bind it to `127.0.0.1` or remove the container and run
`cloudflare/cloudflared` with a `TUNNEL_TOKEN` instead.

**Ollama reachable with no authentication.** If a proxy publishes Ollama to the
internet, anyone can use your GPU and read any model you have pulled.

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://<your-ollama-host>/api/tags   # 200 = exposed
```

Put it behind Cloudflare Access, or stop publishing it.

Neither is caused by this repository, and neither is fixed by deploying it —
but WPistic will be sharing that host.

---

## 9. Troubleshooting

| Symptom | Cause |
|---|---|
| `Missing required environment variable X` at startup | Deliberate. The process refuses to boot half-configured rather than look healthy and hand plugins unverifiable responses. Set it and restart. |
| `migrate` exits non-zero, nothing else starts | Working as designed — services never start against a schema they do not match. Read `docker compose logs migrate`. |
| Login redirects then fails | `ISSUER` ≠ `PUBLIC_ACCOUNT_URL` ≠ `ACCOUNT_SERVICE_URL`. All three must be the same public URL. |
| Sessions do not persist | The identity service sets `Secure` cookies from the request scheme. It must be reached over HTTPS — through the tunnel, not by container IP. |
| Downloads 404 with the license valid | Blob volume not mounted or restored from a backup predating the upload. `blobHealthCheck` catches a missing volume at startup; a *stale* one it cannot. Re-upload the packages. |
| Rate limiting seems inactive | Check the `api` logs for database errors. General traffic fails **open** if the counter is unreachable; login and license activation fail **closed**. |
| Customers cannot reset passwords | `EMAIL_WEBHOOK_URL` is unset, so nothing is delivered. Until you set it, issue reset links by hand from the admin panel (`/users` → Reset link). |

---

## 10. What is verified, and what is not

Verified by execution on this branch:

- Both Node services boot against a real PostgreSQL 16 and serve correctly:
  `/health` 200, unauthenticated `/api/v1/me` 401, unknown route 404, OIDC
  discovery and JWKS 200, the branded login page renders, Zod validation
  rejects malformed license payloads.
- **Rate limiting holds across processes.** 130 concurrent requests split
  across two independent API processes → exactly **100 × 401, 30 × 429**. The
  previous in-memory implementation would have allowed 200.
- 15 migrations and 3 seeds apply clean; seeds idempotent on re-run; the public
  catalog is 15 products.
- `docker compose config` validates with **zero published host ports**.

Not verified here, and yours to confirm on the box:

- A full `docker build` of `Dockerfile.node` (this environment cannot reach the
  Docker registry).
- Anything through an actual Cloudflare Tunnel.
- The admin portal under `@astrojs/node` — it still targets the Cloudflare
  adapter (§3).
