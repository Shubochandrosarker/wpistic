/**
 * Domain normalization for license activations and the website registry.
 * Lowercase, strip protocol/credentials/path, strip ports and trailing
 * dots, normalize www. Local/staging environments are detected so
 * they can be handled with separate activation rules.
 */
import type { SiteEnvironment } from '@wpistic/types';

export function normalizeDomain(input: string): string {
  let domain = input.trim().toLowerCase();
  domain = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//, ''); // protocol
  domain = domain.replace(/^[^@/]+@/, ''); // credentials
  domain = domain.split('/')[0]!.split('?')[0]!.split('#')[0]!; // path/query/fragment
  domain = domain.replace(/:\d+$/, ''); // port
  domain = domain.replace(/\.+$/, ''); // trailing dots
  if (domain.startsWith('www.') && domain.length > 8) domain = domain.slice(4);
  return domain;
}

const LOCAL_PATTERNS = [
  /^localhost(:\d+)?$/,
  /\.local$/,
  /\.test$/,
  /\.localhost$/,
  /^127\.\d+\.\d+\.\d+(:\d+)?$/,
  /^10\.\d+\.\d+\.\d+(:\d+)?$/,
  /^192\.168\.\d+\.\d+(:\d+)?$/,
];

const STAGING_PATTERNS = [/^staging\./, /\.staging\./, /^dev\./, /\.dev\./, /^stage\./, /\.wpengine\.com$/, /\.kinsta\.cloud$/, /\.pantheonsite\.io$/];

/** Best-effort environment detection; the plugin-reported value wins unless it claims production for an obviously local host. */
export function detectEnvironment(normalizedDomain: string, reported: SiteEnvironment): SiteEnvironment {
  if (LOCAL_PATTERNS.some((p) => p.test(normalizedDomain))) return 'local';
  if (reported !== 'production') return reported;
  if (STAGING_PATTERNS.some((p) => p.test(normalizedDomain))) return 'staging';
  return 'production';
}

/** Local/dev/staging activations do not consume production activation slots. */
export function countsTowardActivationLimit(environment: SiteEnvironment): boolean {
  return environment === 'production';
}
