# Cloudflare secret inventory and rotation

Secret values never belong in git, Wrangler vars, issue comments, logs, or this document. Staging and production values are separate.

| Worker | Environment | Secret | Generation/source | Rotation impact |
|---|---|---|---|---|
| Account | both | JWT_PRIVATE_KEY and JWT_PUBLIC_KEY | distinct RS256 PKCS8/SPKI pair | invalidates newly issued tokens after coordinated rotation |
| Account | both | MFA_ENC_KEY | random 32-byte AES key | requires MFA-secret re-encryption plan |
| Account | both | EMAIL_WEBHOOK_URL | approved transactional relay endpoint | password reset/invitation/security notifications unavailable while absent |
| API | both | LICENSE_SIGNING_SECRET | random 32-byte secret | invalidates HMAC license signatures |
| API | both | LICENSE_JWT_PRIVATE_KEY and LICENSE_JWT_PUBLIC_KEY | distinct RS256 pair, not Account keys | invalidates activation-token verification |
| API | both | JWT_PRIVATE_KEY and JWT_PUBLIC_KEY | Account-compatible token keys | coordinate Account/API contract |
| API | both | MFA_ENC_KEY | approved shared MFA key | coordinate with Account |
| API | later only | Stripe secrets | only when billing leaves FREE_ONLY | billing key/webhook rotation |
 
Set values with npx wrangler secret put NAME --env staging or --env production. Use secret bulk only from a protected ephemeral file and delete it immediately. Do not configure ADMIN_API_TOKEN in production.

Rotation: create new material in the secret manager, deploy compatible public keys first, rotate private/signing material in a coordinated window, run auth/license smoke tests, then revoke old material. Recovery requires the approved secret-manager backup and incident review; never recover from git.
