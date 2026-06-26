import { describe, expect, it } from 'vitest';
import { KYC_PATTERNS, validateKyc } from './seller';

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
