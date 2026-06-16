import { describe, expect, it } from 'vitest';
import { guestRedirectFor, isAuthRoute, loginRedirectFor } from './route-protection';

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

describe('isAuthRoute', () => {
  it('matches the auth routes', () => {
    expect(isAuthRoute('/login')).toBe(true);
    expect(isAuthRoute('/register')).toBe(true);
    expect(isAuthRoute('/forgot-password')).toBe(true);
    expect(isAuthRoute('/reset-password')).toBe(true);
  });

  it('rejects non-auth routes', () => {
    expect(isAuthRoute('/')).toBe(false);
    expect(isAuthRoute('/account')).toBe(false);
    expect(isAuthRoute('/loginx')).toBe(false);
  });

  it('matches auth route sub-paths', () => {
    expect(isAuthRoute('/reset-password/confirm')).toBe(true);
    expect(isAuthRoute('/forgot-password/sent')).toBe(true);
  });
});

describe('guestRedirectFor', () => {
  it('redirects an authenticated user away from auth routes to /', () => {
    expect(guestRedirectFor('/login', true)).toBe('/');
    expect(guestRedirectFor('/register', true)).toBe('/');
    expect(guestRedirectFor('/forgot-password', true)).toBe('/');
    expect(guestRedirectFor('/reset-password', true)).toBe('/');
  });

  it('allows an unauthenticated user on auth routes', () => {
    expect(guestRedirectFor('/login', false)).toBeNull();
    expect(guestRedirectFor('/forgot-password', false)).toBeNull();
  });

  it('never redirects non-auth routes', () => {
    expect(guestRedirectFor('/', true)).toBeNull();
    expect(guestRedirectFor('/account', true)).toBeNull();
  });

  it('redirects an authenticated user away from an auth sub-path', () => {
    expect(guestRedirectFor('/reset-password/confirm', true)).toBe('/');
  });
});
