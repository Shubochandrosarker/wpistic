/**
 * JWT issuance: RS256 access tokens (15 min) and ID tokens, plus the JWKS
 * document product APIs and api.wpistic.com use for verification.
 * Keys are imported once per isolate and cached.
 */
import { SignJWT, importPKCS8, importSPKI, exportJWK, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from '../env';
import { ACCESS_TOKEN_TTL_SECONDS } from '../env';
import type { OrgRole } from '@wpistic/types';

const ALG = 'RS256';
let privateKeyPromise: Promise<CryptoKey> | null = null;
let publicKeyPromise: Promise<CryptoKey> | null = null;

/** PEMs stored as secrets may have literal \n sequences — normalize them. */
function normalizePem(pem: string): string {
  return pem.replace(/\\n/g, '\n');
}

function getPrivateKey(env: Env): Promise<CryptoKey> {
  privateKeyPromise ??= importPKCS8(normalizePem(env.JWT_PRIVATE_KEY), ALG);
  return privateKeyPromise;
}

function getPublicKey(env: Env): Promise<CryptoKey> {
  publicKeyPromise ??= importSPKI(normalizePem(env.JWT_PUBLIC_KEY), ALG);
  return publicKeyPromise;
}

export interface AccessTokenInput {
  userId: string;
  email: string;
  orgId: string | null;
  orgRole: OrgRole | null;
  clientId: string;
  scope: string;
  sessionId: string;
}

export async function signAccessToken(env: Env, input: AccessTokenInput): Promise<string> {
  const key = await getPrivateKey(env);
  return new SignJWT({
    email: input.email,
    org_id: input.orgId,
    ...(input.orgRole ? { org_role: input.orgRole } : {}),
    scope: input.scope,
    sid: input.sessionId,
  })
    .setProtectedHeader({ alg: ALG, kid: 'wpistic-1' })
    .setSubject(input.userId)
    .setAudience(input.clientId)
    .setIssuer(env.ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

export interface IdTokenInput {
  userId: string;
  email: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  clientId: string;
}

export async function signIdToken(env: Env, input: IdTokenInput): Promise<string> {
  const key = await getPrivateKey(env);
  return new SignJWT({
    email: input.email,
    email_verified: input.emailVerified,
    given_name: input.firstName ?? undefined,
    family_name: input.lastName ?? undefined,
    name: [input.firstName, input.lastName].filter(Boolean).join(' ') || undefined,
  })
    .setProtectedHeader({ alg: ALG, kid: 'wpistic-1' })
    .setSubject(input.userId)
    .setAudience(input.clientId)
    .setIssuer(env.ISSUER)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(key);
}

export async function verifyAccessToken(env: Env, token: string): Promise<JWTPayload> {
  const key = await getPublicKey(env);
  const { payload } = await jwtVerify(token, key, { issuer: env.ISSUER });
  return payload;
}

export async function getJwks(env: Env): Promise<{ keys: Array<Record<string, unknown>> }> {
  const key = await getPublicKey(env);
  const jwk = await exportJWK(key);
  return { keys: [{ ...jwk, alg: ALG, use: 'sig', kid: 'wpistic-1' }] };
}
