# Cloudflare resource matrix

An item is not provisioned until Wrangler or the Cloudflare API confirms it. IDs are not invented here.

| Resource | Name | Consumer | Environment | Status |
|---|---|---|---|---|
| Worker | wpistic-marketing | Marketing | production | configuration ready; deploy unverified |
| Worker | wpistic-marketing-staging | Marketing | staging | configuration ready; deploy unverified |
| Worker | wpistic-account | Account | production | blocked on Hyperdrive/KV IDs |
| Worker | wpistic-account-staging | Account | staging | blocked on Hyperdrive/KV IDs |
| Worker | wpistic-api | API | production | blocked on Hyperdrive/KV/native rate-limit IDs |
| Worker | wpistic-api-staging | API | staging | blocked on Hyperdrive/KV/native rate-limit IDs |
| Worker | wpistic-dashboard | Dashboard | production | configuration ready; deploy unverified |
| Worker | wpistic-dashboard-staging | Dashboard | staging | configuration ready; deploy unverified |
| Worker | wpistic-admin | Admin plus Access | production | Access/custom domain unverified |
| Worker | wpistic-admin-staging | Admin plus Access | staging | Access/custom domain unverified |
| KV | wpistic-production-pkce, rate-limit, session-cache | Account/API | production | owner provisioning required |
| KV | wpistic-staging-pkce, rate-limit, session-cache | Account/API | staging | owner provisioning required |
| Queue | wpistic-events and wpistic-events-dlq | API | production | owner provisioning required |
| Queue | wpistic-staging-events and wpistic-staging-events-dlq | API | staging | owner provisioning required |
| R2 | wpistic-updates and wpistic-assets | API | production | owner provisioning required |
| R2 | wpistic-staging-updates and wpistic-staging-assets | API | staging | owner provisioning required |
| Hyperdrive | wpistic-production | Account/API | production | restricted-role URL and provisioning required |
| Hyperdrive | wpistic-staging | Account/API | staging | isolated database and provisioning required |
| Rate Limit | environment-specific native namespace | API | both | owner must create/verify namespace |
| Cron | every minute | API outbox publisher | both | declared; live execution unverified |
| Custom Domains | wrangler config routes | all Workers | both | DNS/TLS/conflicts unverified |
| Cloudflare Access | admin hostnames | Admin | both | policy/application unverified |
