import { describe, expect, it, vi } from 'vitest';
import {
  KYC_PATTERNS,
  getSellerMe,
  registerSeller,
  updateSellerMe,
  validateKyc,
} from './seller';
import type { AuthedApiDeps } from './api-authed';

describe('KYC_PATTERNS', () => {
  it('accepts a valid PAN and rejects a bad one', () => {
    expect(KYC_PATTERNS.pan.test('ABCDE1234F')).toBe(true);
    expect(KYC_PATTERNS.pan.test('abcde1234f')).toBe(false);
  });
  it('accepts a valid IFSC and GSTIN', () => {
    expect(KYC_PATTERNS.bankIfsc.test('HDFC0001234')).toBe(true);
    expect(KYC_PATTERNS.gstin.test('22AAAAA0000A1Z5')).toBe(true);
  });
  it('accepts a 9-18 digit bank account, rejects too short', () => {
    expect(KYC_PATTERNS.bankAccountNo.test('123456789')).toBe(true);
    expect(KYC_PATTERNS.bankAccountNo.test('1234')).toBe(false);
  });
});

describe('validateKyc', () => {
  it('returns no errors when fields absent', () => {
    expect(validateKyc({})).toEqual({});
  });
  it('flags only present-but-invalid fields', () => {
    const errs = validateKyc({ pan: 'bad', bankIfsc: 'HDFC0001234' });
    expect(errs.pan).toBeDefined();
    expect(errs.bankIfsc).toBeUndefined();
  });
});

describe('registerSeller', () => {
  it('POSTs to /seller/register with bearer token and returns the view', async () => {
    const view = { id: 's1', displayName: 'Shop', status: 'PENDING_REVIEW' };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => view,
    });
    const result = await registerSeller(
      { displayName: 'Shop' },
      { baseUrl: 'http://api', accessToken: 'tok', fetch: fetchMock as unknown as typeof fetch },
    );
    expect(result).toEqual(view);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api/seller/register');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
});

function makeAuthedDeps(fetchMock: ReturnType<typeof vi.fn>): AuthedApiDeps {
  return {
    baseUrl: 'http://api',
    getAccessToken: () => 'tok',
    getRefreshToken: () => 'ref',
    onTokensRefreshed: () => {},
    onSessionInvalid: () => {},
    fetch: fetchMock as unknown as typeof fetch,
  };
}

describe('getSellerMe', () => {
  it('GETs /seller/me with bearer token and returns the view', async () => {
    const view = { id: 's1', displayName: 'Shop', status: 'ACTIVE' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => view });
    const result = await getSellerMe(makeAuthedDeps(fetchMock));
    expect(result).toEqual(view);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api/seller/me');
    expect(init.method).toBe('GET');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
});

describe('updateSellerMe', () => {
  it('PATCHes /seller/me with bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 's1' }) });
    await updateSellerMe({ pan: 'ABCDE1234F' }, makeAuthedDeps(fetchMock));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://api/seller/me');
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });
});
