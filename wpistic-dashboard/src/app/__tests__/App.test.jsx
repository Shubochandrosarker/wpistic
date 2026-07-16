import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import App from '../App.jsx';
import { boot } from '../lib/boot.js';

// Regression test for a real bug: these five routes rendered <ModulePage>
// without a `module` prop, so ModulePage's `module ? moduleEnabled(module) : true`
// fallback silently bypassed gating — the "not enabled" state never showed,
// even for modules the workspace doesn't have.
const GATED_ROUTES = [
  { path: 'agents', module: 'agents', title: 'AI Agents' },
  { path: 'automations', module: 'automations', title: 'Automations' },
  { path: 'crm', module: 'crm', title: 'CRM' },
  { path: 'inbox', module: 'inbox', title: 'Inbox' },
  { path: 'analytics', module: 'analytics', title: 'Analytics' },
];

describe('App module-gated routes', () => {
  afterEach(() => {
    cleanup();
  });

  it.each(GATED_ROUTES)(
    '/$path shows the "not enabled" state when $module is disabled',
    ({ path, title }) => {
      boot.enabledModules = {};
      window.history.pushState({}, '', `/dashboard/${path}`);

      render(<App />);

      const main = within(screen.getByRole('main'));
      expect(main.getByText(`${title} isn’t enabled yet`)).toBeInTheDocument();
    }
  );

  it.each(GATED_ROUTES)(
    '/$path shows the ready state when $module is enabled',
    ({ path, module, title }) => {
      boot.enabledModules = { [module]: true };
      window.history.pushState({}, '', `/dashboard/${path}`);

      render(<App />);

      // Scope to <main> — the sidebar nav also has a link labeled e.g. "AI Agents".
      const main = within(screen.getByRole('main'));
      expect(main.getByText(title)).toBeInTheDocument();
      expect(main.queryByText(`${title} isn’t enabled yet`)).not.toBeInTheDocument();
    }
  );
});
