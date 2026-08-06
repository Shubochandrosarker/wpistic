/**
 * The auth pages carry their CSS and their form-submit handler inline, so they
 * only work when the page's Content-Security-Policy admits them. Getting that
 * wrong is silent: the browser drops the script, the Sign in button stops
 * doing anything, and nothing in the UI says why. These tests pin the contract
 * between the markup here and the nonce policy in ../index.ts.
 */
import { describe, expect, it } from 'vitest';
import type { OAuthClientRow } from '../db/schema';
import { renderLoginPage, renderRegisterPage, renderResetPage } from './pages';

const NONCE = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

const client = {
  client_id: 'wpistic_dashboard',
  metadata: {},
} as unknown as OAuthClientRow;

const CONTINUE = 'https://account.wpistic.com/authorize?x=1';
const loginHtml = renderLoginPage({ client, continueUrl: CONTINUE, mode: 'login', nonce: NONCE });

const pages: Array<[string, string]> = [
  ['login', loginHtml],
  ['register', renderRegisterPage({ client, continueUrl: CONTINUE, mode: 'register', nonce: NONCE })],
  ['reset request', renderResetPage(NONCE)],
  ['reset confirm', renderResetPage(NONCE, '#C9A961', 'reset-token')],
];

describe.each(pages)('%s page', (_name, html) => {
  it('nonces every inline <style> and <script>', () => {
    const tags = html.match(/<(?:style|script)\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) expect(tag).toContain(`nonce="${NONCE}"`);
  });

  it('carries no style attributes, which a nonce cannot cover', () => {
    expect(html).not.toMatch(/\sstyle="/);
  });

  it('loads no external subresource, so default-src can stay none', () => {
    expect(html).not.toMatch(/<(?:script|link|img)\b[^>]*\s(?:src|href)="(?!\/)/);
  });

  it('warns when scripting is unavailable instead of showing a dead button', () => {
    expect(html).toContain('<noscript>');
  });
});

describe('login page', () => {
  const html = loginHtml;

  it('escapes the nonce into the attribute', () => {
    expect(renderLoginPage({ client, continueUrl: '/', mode: 'login', nonce: 'a"b' })).toContain('nonce="a&quot;b"');
  });

  it('posts to the same origin, which connect-src self admits', () => {
    expect(html).toContain("fetch('/login'");
  });
});
