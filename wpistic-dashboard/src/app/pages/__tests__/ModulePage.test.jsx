import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import ModulePage from '../ModulePage.jsx';
import { boot } from '../../lib/boot.js';

describe('ModulePage', () => {
  beforeEach(() => {
    boot.enabledModules = {};
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the "not enabled" state when its named module is disabled', () => {
    render(<ModulePage module="crm" icon="users" title="CRM" description="Contacts and deals." />);

    expect(screen.getByText('CRM isn’t enabled yet')).toBeInTheDocument();
    expect(screen.getByText('Contacts and deals.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /learn more/i })).toBeInTheDocument();
  });

  it('shows the ready state when its named module is enabled', () => {
    boot.enabledModules = { crm: true };

    render(<ModulePage module="crm" icon="users" title="CRM" description="Contacts and deals." />);

    expect(screen.getByText('CRM')).toBeInTheDocument();
    expect(screen.queryByText('CRM isn’t enabled yet')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /learn more/i })).not.toBeInTheDocument();
  });

  /**
   * A page that is intentionally NOT module-gated (no `module` prop at all)
   * must always render as available. This is different from a *named*
   * module being disabled — see the App.jsx route tests for the regression
   * this used to mask (routes silently omitting the `module` prop).
   */
  it('defaults to the ready state when no module prop is given at all', () => {
    render(<ModulePage icon="cube" title="Ungated" description="Always on." />);

    expect(screen.getByText('Ungated')).toBeInTheDocument();
    expect(screen.queryByText('Ungated isn’t enabled yet')).not.toBeInTheDocument();
  });
});
