# WPistic Control Plane API Specification

## Base URL
```
https://api.wpistic.com/api/v1
```

## Authentication

### Bearer Token (JWT)
Most endpoints require an RS256-signed JWT from `account.wpistic.com`:
```
Authorization: Bearer <JWT>
```

JWT claims:
- `sub`: User ID
- `email`: User email
- `org_id`: Organization ID (optional, for org context)
- `org_role`: Role in org (owner, admin, billing_manager, etc.)
- `scope`: Space-separated scopes (openid profile email org)
- `exp`: Expiration timestamp

### Organization Context
For org-scoped routes, pass either:
- JWT with `org_id` claim (auto-detected), OR
- Header: `X-Organization-Id: {uuid}`

### Admin Token
Admin routes can use:
- `X-Admin-API-Token: {ADMIN_API_TOKEN}` for service-to-service, OR
- Staff JWT (`email` in `ADMIN_EMAILS` env list)

---

## Core Entities

### License
```typescript
{
  "id": "uuid",
  "organization_id": "uuid",
  "product_id": "uuid",
  "plan_id": "uuid",
  "key_mask": "productname_****XXXX",  // masked for display
  "status": "active" | "suspended" | "expired" | "revoked" | "transferred",
  "max_activations": 5,
  "expires_at": "2027-07-25T00:00:00Z" | null,
  "created_at": "2026-07-25T07:00:00Z",
  "updated_at": "2026-07-25T07:00:00Z"
}
```

### Activation
```typescript
{
  "id": "uuid",
  "license_id": "uuid",
  "domain_normalized": "example.com",
  "environment": "production" | "staging" | "development" | "local",
  "installation_uuid": "uuid (from plugin install)",
  "first_activated_at": "2026-07-25T07:00:00Z",
  "last_checked_at": "2026-07-26T07:00:00Z",
  "last_seen_at": "2026-07-26T07:00:00Z",
  "status": "active" | "inactive" | "revoked"
}
```

### Website
```typescript
{
  "id": "uuid",
  "organization_id": "uuid",
  "domain_normalized": "example.com",
  "display_domain": "example.com",
  "environment": "production",
  "wp_version": "6.6",
  "php_version": "8.2",
  "health_status": "healthy" | "degraded" | "offline" | "unknown",
  "last_heartbeat_at": "2026-07-26T07:00:00Z",
  "connected_products": ["productA", "productB"],
  "created_at": "2026-07-25T07:00:00Z"
}
```

---

## Endpoints

### Licenses

#### Issue License (Admin/Internal Only)
```
POST /admin/licenses
Authorization: Bearer {ADMIN_TOKEN}

{
  "organization_id": "uuid",
  "product_id": "uuid",
  "plan_id": "uuid",
  "max_activations": 5,        // optional, defaults to plan entitlement
  "expires_at": "2027-07-25T00:00:00Z"  // optional
}

Response (201):
{
  "license": { ...License },
  "key": "productname_a3f9b2c1e4d5f8g9h0i1j2k3l4m5n6o7",  // SHOWN ONCE
  "key_mask": "productname_****n6o7"
}
```

#### Activate License (Public, Plugin)
```
POST /licenses/activate
X-Idempotency-Key: {uuid}-{hash}  // optional but recommended

{
  "key": "productname_a3f9b2c1e4d5f8g9h0i1j2k3l4m5n6o7",
  "domain": "https://example.com",
  "environment": "production",  // optional, auto-detected from domain
  "installation_uuid": "uuid",  // unique per WordPress install
  "wp_site_url": "https://example.com",
  "wp_home_url": "https://example.com",
  "wp_version": "6.6",
  "php_version": "8.2",
  "plugin_version": "2.0.0",
  "activation_meta": {}  // optional custom data
}

Response (200):
{
  "activation_token": "eyJ...",  // JWT for validate/deactivate/refresh
  "verification_key": "abc123def456...",  // Hex HMAC key for offline verification
  "website_id": "uuid",
  "domain_normalized": "example.com",
  "environment": "production",
  "first_activated_at": "2026-07-25T07:00:00Z"
}

Errors:
- 400: invalid_key — License not found or inactive
- 400: invalid_domain — Domain validation failed
- 429: rate_limited — Too many activation attempts
- 409: max_activations_exceeded — License has reached site limit
```

#### Validate License (Public, Plugin)
```
POST /licenses/validate

{
  "activation_token": "eyJ..."
}

Response (200):
{
  "valid": true,
  "status": "active" | "grace_period",
  "product": "productname",
  "plan": "professional",
  "expires_at": "2027-07-25T00:00:00Z",
  "grace_period_ends_at": "2027-08-01T00:00:00Z" | null,
  "activation": {
    "id": "uuid",
    "domain": "example.com",
    "environment": "production",
    "first_activated_at": "2026-07-25T07:00:00Z"
  },
  "entitlements": {
    "productname.pro.enabled": true,
    "productname.sites.max": 5,
    "productname.ai.monthly_credits": 500
  },
  "updates": {
    "channel": "stable",
    "allowed": true,
    "current_version": "2.1.0",
    "package_available": true
  },
  "check_after": 43200,  // seconds until next check recommended
  "grace_period_days": 7,
  "signature": "hmac_sha256_hex"  // HMAC(derived_key, response_json)
}
```

**Offline Verification (PHP SDK):**
```php
$derived_key = hash_hmac('sha256', $license_key_hash, $master_secret);
$expected_sig = hash_hmac('sha256', json_encode($response), $derived_key);
$is_valid = hash_equals($response['signature'], $expected_sig);
```

#### Deactivate License (Public, Plugin)
```
POST /licenses/deactivate

{
  "activation_token": "eyJ...",
  "installation_uuid": "uuid",
  "domain": "example.com"
}

Response (200):
{
  "deactivated": true
}
```

#### Refresh License (Public, Plugin)
```
POST /licenses/refresh

{
  "activation_token": "eyJ..."
}

Response (200):
{
  "activation_token": "eyJ_new...",  // New token if rotated
  ...ValidationResponse
}
```

#### Rotate License Key (Org Dashboard, Admin Only)
```
POST /organizations/{orgId}/licenses/{licenseId}/rotate
Authorization: Bearer {JWT}
X-Organization-Id: {orgId}

{}

Response (200):
{
  "license": { ...License },
  "activations": [ ...Activation[] ],
  "key": "productname_new_key_shown_once",
  "key_mask": "productname_****XXX"
}

Note: All existing activations are revoked.
```

#### List Organization Licenses
```
GET /organizations/{orgId}/licenses
  ?product_id=uuid&status=active&page=1&limit=50

Response (200):
{
  "licenses": [ ...License[] ],
  "total": 150,
  "page": 1,
  "page_size": 50
}
```

#### Get License Details + Activations
```
GET /organizations/{orgId}/licenses/{licenseId}

Response (200):
{
  "license": { ...License },
  "activations": [
    {
      "id": "uuid",
      "domain_normalized": "example.com",
      "environment": "production",
      "status": "active",
      "first_activated_at": "...",
      "last_checked_at": "..."
    }
  ]
}
```

#### Get License Audit Trail
```
GET /organizations/{orgId}/licenses/{licenseId}/audit
  ?page=1&limit=100

Response (200):
{
  "events": [
    {
      "id": "uuid",
      "event_type": "issued" | "activated" | "validated" | "deactivated" | "rotated" | "expired" | "revoked" | "suspended" | "grace_period_started" | "grace_period_ended",
      "ip_address": "1.2.3.4",
      "user_agent": "Mozilla/5.0...",
      "created_at": "...",
      "meta": {}
    }
  ],
  "total": 42
}
```

---

### Websites

#### List Organization Websites
```
GET /organizations/{orgId}/websites
  ?health_status=healthy&page=1

Response (200):
{
  "websites": [ ...Website[] ]
}
```

#### Add Website to Organization
```
POST /organizations/{orgId}/websites

{
  "domain": "example.com",
  "name": "Production Site",
  "environment": "production",
  "wp_version": "6.6",
  "php_version": "8.2"
}

Response (201):
{
  "website_id": "uuid",
  "connection_token": "wpconn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6",  // SHOWN ONCE
  "display_domain": "example.com"
}
```

#### Connect Website (Plugin)
```
POST /websites/connect

{
  "connection_token": "wpconn_...",
  "activation_token": "eyJ...",  // From license activation
  "product": "productname",
  "domain": "example.com",
  "environment": "production",
  "wp_version": "6.6",
  "php_version": "8.2",
  "active_theme": "twenty-twenty-four",
  "installed_plugins": ["plugin-slug-1", "plugin-slug-2"]
}

Response (201):
{
  "website_id": "uuid",
  "organization_id": "uuid",
  "confirmed": true
}
```

#### Website Heartbeat (Plugin)
```
POST /websites/heartbeat
X-Website-Token: {connection_token}  // Alternative to body

{
  "wp_version": "6.6",
  "php_version": "8.2",
  "plugin_version": "2.0.0",
  "health_metrics": {
    "memory_usage_percent": 45,
    "error_count_24h": 2
  }
}

Response (200):
{
  "health_status": "healthy" | "degraded" | "offline",
  "pending_commands": [
    {
      "type": "refresh_license" | "update_available" | "check_connection",
      "data": {}
    }
  ],
  "next_heartbeat_in_seconds": 3600
}
```

#### Disconnect Website
```
DELETE /organizations/{orgId}/websites/{websiteId}

Response (204): No content
```

---

### Updates

#### Check for Updates (Public, License-Gated)
```
GET /products/{slug}/updates
  ?version=2.0.0&channel=stable&license_token={activation_token}

Response (200):
{
  "has_update": true,
  "version": "2.1.0",
  "release_notes": "...",
  "package_size": 2048000,
  "checksum": "sha256:abc123...",
  "requires": {
    "php": "7.4",
    "wp": "6.0",
    "plan": "professional"
  },
  "download_url": "/api/v1/downloads/file?token=eyJ...",
  "is_security_release": false,
  "tested_up_to": "6.6"
}
```

#### Authorize Download (Public, License-Gated)
```
POST /downloads/authorize

{
  "activation_token": "eyJ...",
  "version": "2.1.0",  // optional, defaults to latest
  "product_slug": "productname"
}

Response (200):
{
  "download_url": "/api/v1/downloads/file?token=eyJ...",
  "expires_in": 900  // 15 minutes
}
```

#### Download File (Public, Token-Gated, Single-Use)
```
GET /downloads/file?token={jwt}

Response (200):
- Content-Type: application/zip
- Content-Disposition: attachment; filename="productname-2.1.0.zip"
- Content-Length: 2048000
- [Binary file contents]

Errors:
- 401: Invalid or expired token
- 404: Package not found
- 410: Token already used
```

---

### Entitlements

#### Get Organization Entitlements
```
GET /organizations/{orgId}/entitlements

Response (200):
{
  "entitlements": {
    "productname.pro.enabled": true,
    "productname.sites.max": 5,
    "productname.ai.monthly_credits": 500,
    "productname_2.basic.enabled": true
  },
  "sources": [
    {
      "type": "subscription" | "license",
      "id": "uuid",
      "product": "productname",
      "plan": "professional"
    }
  ],
  "version": 42,
  "resolved_at": "2026-07-26T07:00:00Z"
}
```

---

## Error Format

All errors follow:
```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable message",
    "correlation_id": "uuid",
    "details": {}
  }
}
```

Common codes:
- `not_found` (404)
- `unauthorized` (401)
- `forbidden` (403)
- `invalid_request` (400)
- `rate_limited` (429)
- `conflict` (409)
- `server_error` (500)

---

## Rate Limits

| Endpoint | Limit | Window |
|----------|-------|--------|
| `POST /licenses/activate` | 5 | 1 hour per IP |
| `POST /licenses/validate` | 100 | 1 minute per IP |
| `POST /downloads/authorize` | 10 | 1 minute per IP |
| Most GET endpoints | 1000 | 1 minute per IP |

Rate limit headers:
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset` (Unix timestamp)

---

## Idempotency

POST requests can include `X-Idempotency-Key: {uuid}` header.
If retried with same key within 24 hours, returns cached response.

---

## Pagination

List endpoints support:
- `?page=1` (default)
- `?limit=50` (default, max 200)
- `?offset=0` (alternative to page-based)

Response includes:
- `total`: total items across all pages
- `page`: current page
- `page_size`: items per page
- `has_more`: boolean

---

## Webhooks

Outbound webhooks (from platform to product apps):

```json
{
  "id": "evt_123",
  "type": "license.activated",
  "created_at": "2026-07-25T07:00:00Z",
  "organization_id": "uuid",
  "product": "productname",
  "data": {
    "license_id": "uuid",
    "activation_id": "uuid",
    "domain": "example.com"
  },
  "signature": "t=1719298800,v1=abc123..."
}
```

Signature verification (Node.js):
```typescript
const crypto = require('crypto');
const [timestamp, signature] = webhook.signature.split(',').reduce((acc, part) => {
  const [key, value] = part.split('=');
  if (key === 't') acc[0] = value;
  if (key === 'v1') acc[1] = value;
  return acc;
}, []);

const body = JSON.stringify(webhook);
const expected = crypto.createHmac('sha256', signing_secret).update(`${timestamp}.${body}`).digest('hex');
const isValid = crypto.timingSafeEqual(expected, signature);
```

---

## Best Practices

1. **Store hashes, not raw keys**: Never log or display raw license keys
2. **Use activation tokens, not keys**: Plugins should exchange key for token at activation only
3. **Verify signatures locally**: Use `verification_key` to validate responses offline
4. **Respect grace period**: Keep premium features active for 7 days if API unreachable
5. **Normalize domains**: Use provided normalization function for consistent activation
6. **Implement retry logic**: 429 and 5xx responses should retry with exponential backoff
7. **Cache entitlements locally**: Reduce API calls by caching for 12-24 hours
8. **Use idempotency keys**: Prevent duplicate activations on retry

---

## Changelog

### v1.0.0 (Current)
- License issuance, activation, validation, deactivation
- Website registry with health tracking
- Secure update checks and downloads
- Offline verification via HMAC signatures
- 7-day grace period for offline resilience
