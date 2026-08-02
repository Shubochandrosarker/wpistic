/**
 * Tests for domain normalization and environment detection.
 * Critical for consistent license activation across environments.
 */
import { describe, it, expect } from 'vitest';
import { normalizeDomain, detectEnvironment } from './domain';
import type { SiteEnvironment } from '@wpistic/types';

describe('normalizeDomain', () => {
  it('should convert to lowercase', () => {
    expect(normalizeDomain('EXAMPLE.COM')).toBe('example.com');
    expect(normalizeDomain('Example.Com')).toBe('example.com');
  });

  it('should remove leading protocol', () => {
    expect(normalizeDomain('https://example.com')).toBe('example.com');
    expect(normalizeDomain('http://example.com')).toBe('example.com');
  });

  it('should remove trailing slash', () => {
    expect(normalizeDomain('example.com/')).toBe('example.com');
    expect(normalizeDomain('example.com///')).toBe('example.com');
  });

  it('should remove www prefix', () => {
    expect(normalizeDomain('www.example.com')).toBe('example.com');
    expect(normalizeDomain('www.www.example.com')).toBe('www.example.com');
  });

  it('should remove port numbers', () => {
    expect(normalizeDomain('example.com:8080')).toBe('example.com');
    expect(normalizeDomain('example.com:443')).toBe('example.com');
    expect(normalizeDomain('example.com:3000')).toBe('example.com');
  });

  it('should preserve subdomains', () => {
    expect(normalizeDomain('staging.example.com')).toBe('staging.example.com');
    expect(normalizeDomain('api.staging.example.com')).toBe('api.staging.example.com');
  });

  it('should handle complex URLs', () => {
    expect(normalizeDomain('https://staging.example.com:8080/path')).toBe('staging.example.com');
    expect(normalizeDomain('HTTP://WWW.EXAMPLE.COM/')).toBe('example.com');
  });

  it('should trim whitespace', () => {
    expect(normalizeDomain('  example.com  ')).toBe('example.com');
  });

  // normalizeDomain returns string always (never null)
});

describe('detectEnvironment', () => {
  it('should detect local environments', () => {
    expect(detectEnvironment('localhost', 'production')).toBe('local');
    expect(detectEnvironment('127.0.0.1', 'production')).toBe('local');
    expect(detectEnvironment('mysite.local', 'production')).toBe('local');
    expect(detectEnvironment('mysite.test', 'production')).toBe('local');
  });

  it('should detect staging environments', () => {
    expect(detectEnvironment('staging.example.com', 'production')).toBe('staging');
    expect(detectEnvironment('stage.example.com', 'production')).toBe('staging');
    expect(detectEnvironment('dev.example.com', 'production')).toBe('staging');
    expect(detectEnvironment('example.wpengine.com', 'production')).toBe('staging');
  });

  it('should detect production as default', () => {
    expect(detectEnvironment('example.com', 'production')).toBe('production');
    expect(detectEnvironment('app.example.com', 'production')).toBe('production');
  });

  it('should respect explicit environment parameter', () => {
    expect(detectEnvironment('example.com', 'development')).toBe('development');
    expect(detectEnvironment('localhost', 'development')).toBe('local'); // local pattern always wins
  });

  it('should prefer local pattern detection', () => {
    expect(detectEnvironment('staging.example.com', 'production')).toBe('staging');
    expect(detectEnvironment('example.com', 'production')).toBe('production');
  });
});
