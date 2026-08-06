/**
 * Browser-side admin client. Every mutation goes through the same-origin
 * `/api/proxy` so the staff access token stays in the Worker.
 *
 * The step-up handshake lives here rather than in each island. Routine
 * mutations are sent without a code; if the API answers `step_up_required`,
 * the caller is prompted once, the window is opened, and the original request
 * is replayed. Irreversible routes ignore the window and demand a code for
 * that specific action — those are declared with `mfa: true` and prompt up
 * front.
 */

export interface AdminCallOptions {
  method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: Record<string, unknown>;
  /** Route requires a per-action TOTP code (irreversible operations). */
  mfa?: boolean;
  /** Prompt text shown when asking for a reason. Omit to skip. */
  reason?: string;
}

export class AdminError extends Error {
  constructor(
    message: string,
    public code: string | null
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

/** Thrown when the operator dismisses a prompt — callers treat it as "no-op". */
export class Cancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'Cancelled';
  }
}

async function post(endpoint: string, method: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, method, body }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
  if (!res.ok) {
    throw new AdminError(json.error?.message ?? `Request failed (${res.status})`, json.error?.code ?? null);
  }
  return json;
}

function askCode(label = 'Authenticator code'): string {
  const code = window.prompt(`${label}:`) ?? '';
  if (!/^\d{6,10}$/.test(code.trim())) throw new Cancelled();
  return code.trim();
}

/** Open (or re-open) the 15-minute elevated window. */
export async function unlock(): Promise<{ expires_at: string }> {
  const result = (await post('/step-up', 'POST', { mfa_code: askCode('Authenticator code to unlock admin changes') })) as {
    expires_at: string;
  };
  window.dispatchEvent(new CustomEvent('wpistic:step-up', { detail: result }));
  return result;
}

export async function lock(): Promise<void> {
  await post('/step-up', 'DELETE', {});
  window.dispatchEvent(new CustomEvent('wpistic:step-up', { detail: null }));
}

/**
 * Perform an admin mutation, handling reason prompts, per-action MFA, and the
 * step-up replay. Returns the parsed response body.
 */
export async function adminCall<T = unknown>(endpoint: string, options: AdminCallOptions = {}): Promise<T> {
  const method = options.method ?? 'POST';
  const body: Record<string, unknown> = { ...(options.body ?? {}) };

  if (options.reason) {
    const reason = window.prompt(`${options.reason}\n\nReason (recorded in the audit log):`) ?? '';
    if (reason.trim().length < 3) throw new Cancelled();
    body.reason = reason.trim();
  }
  if (options.mfa) body.mfa_code = askCode('Fresh authenticator code (required for this action)');

  try {
    return (await post(endpoint, method, body)) as T;
  } catch (err) {
    // One transparent retry: the operator's window lapsed mid-session, so
    // collect a code and replay rather than losing the form they filled in.
    if (err instanceof AdminError && err.code === 'step_up_required') {
      await unlock();
      return (await post(endpoint, method, body)) as T;
    }
    throw err;
  }
}

/** Normalize any thrown value into something worth showing a human. */
export function describeError(err: unknown): string | null {
  if (err instanceof Cancelled) return null;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
