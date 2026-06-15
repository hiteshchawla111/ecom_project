import { describe, expect, it } from 'vitest';
import { loginRedirectFor } from './route-protection';

describe('loginRedirectFor', () => {
  it('redirects an unauthenticated request to a protected route', () => {
    expect(loginRedirectFor('/account', false)).toBe('/login');
    expect(loginRedirectFor('/account/orders', false)).toBe('/login');
  });

  it('allows an authenticated request to a protected route', () => {
    expect(loginRedirectFor('/account', true)).toBeNull();
  });

  it('never redirects public routes regardless of auth', () => {
    expect(loginRedirectFor('/', false)).toBeNull();
    expect(loginRedirectFor('/login', false)).toBeNull();
    expect(loginRedirectFor('/register', false)).toBeNull();
  });
});
