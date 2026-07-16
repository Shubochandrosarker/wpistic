import { describe, it, expect, beforeEach } from 'vitest';
import { boot, moduleEnabled, can } from '../boot.js';

describe('moduleEnabled', () => {
  beforeEach(() => {
    boot.enabledModules = {};
  });

  it('returns false when the module key is absent', () => {
    expect(moduleEnabled('crm')).toBe(false);
  });

  it('returns true when the module is explicitly enabled', () => {
    boot.enabledModules = { crm: true };
    expect(moduleEnabled('crm')).toBe(true);
  });

  it('returns false when the module is explicitly disabled', () => {
    boot.enabledModules = { crm: false };
    expect(moduleEnabled('crm')).toBe(false);
  });

  it('does not throw when enabledModules itself is missing', () => {
    boot.enabledModules = undefined;
    expect(moduleEnabled('crm')).toBe(false);
  });
});

describe('can', () => {
  beforeEach(() => {
    boot.currentUser = { caps: {} };
  });

  it('returns false when the capability key is absent', () => {
    expect(can('manage_billing')).toBe(false);
  });

  it('returns true when the capability is granted', () => {
    boot.currentUser = { caps: { manage_billing: true } };
    expect(can('manage_billing')).toBe(true);
  });

  it('returns false when the capability is explicitly denied', () => {
    boot.currentUser = { caps: { manage_billing: false } };
    expect(can('manage_billing')).toBe(false);
  });

  it('does not throw when currentUser itself is missing', () => {
    boot.currentUser = undefined;
    expect(can('manage_billing')).toBe(false);
  });
});
