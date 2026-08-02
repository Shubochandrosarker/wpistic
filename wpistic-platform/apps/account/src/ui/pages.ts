/**
 * Branded server-rendered auth pages. account.wpistic.com is the single
 * login surface for the whole ecosystem: ?client=chatbotistic renders the
 * Chatbotistic-branded flow, while the account itself stays global.
 * Branding comes from oauth_clients.metadata with a hardcoded fallback.
 */
import type { OAuthClientRow } from '../db/schema';

interface Branding {
  displayName: string;
  accent: string;
}

const FALLBACK_BRANDING: Record<string, Branding> = {
  wpistic_dashboard: { displayName: 'WPistic', accent: '#C9A961' },
  wpistic_admin: { displayName: 'WPistic Admin', accent: '#C9A961' },
  chatbotistic: { displayName: 'Chatbotistic', accent: '#5B8DEF' },
  insightistic: { displayName: 'Insightistic', accent: '#34C77B' },
  tripistic: { displayName: 'Tripistic', accent: '#E8734A' },
  wpagentistic: { displayName: 'WP Agentistic', accent: '#9B6DFF' },
};

function brandingFor(client: OAuthClientRow | null): Branding {
  const meta = (client?.metadata ?? {}) as { display_name?: string; accent?: string };
  const fallback = (client && FALLBACK_BRANDING[client.client_id]) || { displayName: 'WPistic', accent: '#C9A961' };
  return {
    displayName: meta.display_name ?? fallback.displayName,
    accent: /^#[0-9a-fA-F]{6}$/.test(meta.accent ?? '') ? meta.accent! : fallback.accent,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, accent: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
  :root { --accent: ${accent}; }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: #0A0A0A; color: #F5F5F4;
    font: 15px/1.5 Inter, system-ui, sans-serif;
    min-height: 100vh; display: grid; place-items: center; padding: 24px;
  }
  .card {
    width: 100%; max-width: 400px; background: #1A1A1C;
    border: 1px solid #2A2A2D; border-radius: 12px; padding: 36px 32px;
    box-shadow: 0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6);
  }
  .mark {
    width: 40px; height: 40px; border-radius: 10px; background: var(--accent);
    display: grid; place-items: center; font-weight: 700; color: #0A0A0A; font-size: 18px;
    margin-bottom: 20px;
  }
  h1 { font-size: 20px; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 4px; }
  .sub { color: #A1A1A1; font-size: 14px; margin-bottom: 24px; }
  label { display: block; font-size: 13px; color: #A1A1A1; margin: 14px 0 6px; }
  input {
    width: 100%; background: #0A0A0A; color: #F5F5F4;
    border: 1px solid #2A2A2D; border-radius: 8px; padding: 10px 12px; font-size: 15px;
  }
  input:focus { outline: none; border-color: var(--accent); }
  button {
    width: 100%; margin-top: 22px; background: var(--accent); color: #0A0A0A;
    border: 0; border-radius: 8px; padding: 11px; font-size: 15px; font-weight: 600; cursor: pointer;
  }
  button:hover { filter: brightness(1.06); }
  button[disabled] { opacity: .6; cursor: default; }
  .error {
    display: none; background: rgba(239,68,68,.1); border: 1px solid rgba(239,68,68,.35);
    color: #FCA5A5; border-radius: 8px; padding: 10px 12px; font-size: 13px; margin-bottom: 8px;
  }
  .row { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
  .muted, a { color: #6B6B6B; font-size: 13px; text-decoration: none; }
  a:hover { color: var(--accent); }
  .alt { text-align: center; margin-top: 22px; font-size: 13px; color: #6B6B6B; }
  .alt a { color: var(--accent); }
  #mfa-field { display: none; }
  .check { display: flex; gap: 8px; align-items: center; font-size: 13px; color: #A1A1A1; }
  .check input { width: auto; }
</style>
</head>
<body>
<main class="card">${body}</main>
</body>
</html>`;
}

export interface AuthPageOptions {
  client: OAuthClientRow | null;
  continueUrl: string;
  mode: 'login' | 'register';
}

export function renderLoginPage(options: AuthPageOptions): string {
  const brand = brandingFor(options.client);
  const continueAttr = escapeHtml(options.continueUrl);
  const registerHref = `/register?${new URLSearchParams({
    client: options.client?.client_id ?? 'wpistic_dashboard',
    continue: options.continueUrl,
  }).toString()}`;

  return layout(
    `Sign in to ${brand.displayName}`,
    brand.accent,
    `
<div class="mark">${escapeHtml(brand.displayName.charAt(0))}</div>
<h1>Sign in to ${escapeHtml(brand.displayName)}</h1>
<p class="sub">One WPistic account for the whole ecosystem.</p>
<div class="error" id="error"></div>
<form id="form" data-continue="${continueAttr}">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" required autofocus>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <div id="mfa-field">
    <label for="mfa">Authenticator code</label>
    <input id="mfa" name="mfa_code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456">
  </div>
  <div class="row">
    <label class="check" style="margin:0"><input type="checkbox" name="remember_me"> Remember me</label>
    <a href="/reset">Forgot password?</a>
  </div>
  <button type="submit" id="submit">Sign in</button>
</form>
<p class="alt">New here? <a href="${registerHref}">Create your account</a></p>
<script>
(function () {
  var form = document.getElementById('form');
  var errorBox = document.getElementById('error');
  var mfaField = document.getElementById('mfa-field');
  var submit = document.getElementById('submit');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorBox.style.display = 'none';
    submit.disabled = true;
    var data = Object.fromEntries(new FormData(form).entries());
    data.remember_me = !!data.remember_me;
    if (!data.mfa_code) delete data.mfa_code;
    try {
      var res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      var json = await res.json();
      if (res.ok) { window.location.assign(form.dataset.continue || '/'); return; }
      if (json.error && json.error.code === 'mfa_required') {
        mfaField.style.display = 'block';
        document.getElementById('mfa').focus();
        errorBox.textContent = 'Enter the 6-digit code from your authenticator app.';
      } else {
        errorBox.textContent = (json.error && json.error.message) || 'Sign in failed.';
      }
      errorBox.style.display = 'block';
    } catch (err) {
      errorBox.textContent = 'Network error — try again.';
      errorBox.style.display = 'block';
    } finally {
      submit.disabled = false;
    }
  });
})();
</script>`
  );
}

export function renderRegisterPage(options: AuthPageOptions): string {
  const brand = brandingFor(options.client);
  const continueAttr = escapeHtml(options.continueUrl);
  const loginHref = `/login?${new URLSearchParams({
    client: options.client?.client_id ?? 'wpistic_dashboard',
    continue: options.continueUrl,
  }).toString()}`;

  return layout(
    `Create your ${brand.displayName} account`,
    brand.accent,
    `
<div class="mark">${escapeHtml(brand.displayName.charAt(0))}</div>
<h1>Create your account</h1>
<p class="sub">Sign up once, use every WPistic product.</p>
<div class="error" id="error"></div>
<form id="form" data-continue="${continueAttr}">
  <label for="first_name">First name</label>
  <input id="first_name" name="first_name" required autofocus>
  <label for="last_name">Last name</label>
  <input id="last_name" name="last_name">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" autocomplete="email" required>
  <label for="password">Password <span class="muted">(10+ characters)</span></label>
  <input id="password" name="password" type="password" autocomplete="new-password" minlength="10" required>
  <label for="organization_name">Organization <span class="muted">(optional)</span></label>
  <input id="organization_name" name="organization_name" placeholder="Acme Agency">
  <button type="submit" id="submit">Create account</button>
</form>
<p class="alt">Already have an account? <a href="${loginHref}">Sign in</a></p>
<script>
(function () {
  var form = document.getElementById('form');
  var errorBox = document.getElementById('error');
  var submit = document.getElementById('submit');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorBox.style.display = 'none';
    submit.disabled = true;
    var data = Object.fromEntries(new FormData(form).entries());
    if (!data.organization_name) delete data.organization_name;
    if (!data.last_name) delete data.last_name;
    try {
      var res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data)
      });
      var json = await res.json();
      if (res.ok) { window.location.assign(form.dataset.continue || '/'); return; }
      errorBox.textContent = (json.error && json.error.message) || 'Registration failed.';
      errorBox.style.display = 'block';
    } catch (err) {
      errorBox.textContent = 'Network error — try again.';
      errorBox.style.display = 'block';
    } finally {
      submit.disabled = false;
    }
  });
})();
</script>`
  );
}

export function renderResetPage(accent = '#C9A961', token: string | null = null): string {
  const requestForm = `
<h1>Reset your password</h1>
<p class="sub">We'll email you a reset link.</p>
<div class="error" id="error"></div>
<form id="form" data-endpoint="/password-reset/request">
  <label for="email">Email</label>
  <input id="email" name="email" type="email" required autofocus>
  <button type="submit" id="submit">Send reset link</button>
</form>`;
  const confirmForm = `
<h1>Choose a new password</h1>
<p class="sub">Your other sessions will be signed out.</p>
<div class="error" id="error"></div>
<form id="form" data-endpoint="/password-reset/confirm">
  <input type="hidden" name="token" value="${escapeHtml(token ?? '')}">
  <label for="password">New password <span class="muted">(10+ characters)</span></label>
  <input id="password" name="password" type="password" minlength="10" autocomplete="new-password" required autofocus>
  <button type="submit" id="submit">Update password</button>
</form>`;

  return layout(
    'Reset password — WPistic',
    accent,
    `
<div class="mark">W</div>
${token ? confirmForm : requestForm}
<p class="alt"><a href="/login">Back to sign in</a></p>
<script>
(function () {
  var form = document.getElementById('form');
  var errorBox = document.getElementById('error');
  var submit = document.getElementById('submit');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    errorBox.style.display = 'none';
    submit.disabled = true;
    var data = Object.fromEntries(new FormData(form).entries());
    try {
      var res = await fetch(form.dataset.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var json = await res.json();
      if (res.ok) {
        form.innerHTML = '<p class="sub">' + (json.message || 'Done. Check your inbox.') + '</p>';
        return;
      }
      errorBox.textContent = (json.error && json.error.message) || 'Request failed.';
      errorBox.style.display = 'block';
    } catch (err) {
      errorBox.textContent = 'Network error — try again.';
      errorBox.style.display = 'block';
    } finally {
      submit.disabled = false;
    }
  });
})();
</script>`
  );
}
