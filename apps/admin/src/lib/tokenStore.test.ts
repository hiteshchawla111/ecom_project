import { describe, it, expect, beforeEach } from 'vitest';
import { tokenStore } from './tokenStore';

describe('tokenStore', () => {
  beforeEach(() => localStorage.clear());

  it('returns null when nothing is stored', () => {
    expect(tokenStore.get()).toBeNull();
  });

  it('round-trips a token pair', () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    expect(tokenStore.get()).toEqual({ accessToken: 'a', refreshToken: 'r' });
  });

  it('clears stored tokens', () => {
    tokenStore.set({ accessToken: 'a', refreshToken: 'r' });
    tokenStore.clear();
    expect(tokenStore.get()).toBeNull();
  });

  it('treats partial/corrupt storage as empty and clears it', () => {
    localStorage.setItem('admin.auth', '{"accessToken":"a"}'); // missing refreshToken
    expect(tokenStore.get()).toBeNull();
    expect(localStorage.getItem('admin.auth')).toBeNull();
  });

  it('treats unparseable storage as empty', () => {
    localStorage.setItem('admin.auth', 'not json');
    expect(tokenStore.get()).toBeNull();
  });
});
