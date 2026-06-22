import { SellerStatus } from '@prisma/client';
import { toSellerView } from './seller-mask';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_DATE = new Date('2024-01-15T10:00:00.000Z');
const KYC_DATE = new Date('2024-06-01T00:00:00.000Z');

/** A fully-populated seller with all KYC fields present. */
const fullSeller = {
  id: 'clr1234567890',
  displayName: 'Acme Traders',
  slug: 'acme-traders',
  description: 'Quality goods since 1990',
  logoUrl: 'https://cdn.example.com/acme.png',
  status: SellerStatus.ACTIVE,
  kycVerifiedAt: KYC_DATE,
  // KYC fields — callers pass DECRYPTED values to this fn
  bankAccountNo: '123456781234',
  gstin: '22AAAAA0000A1Z5',
  pan: 'AAAAA0000A',
  bankIfsc: 'SBIN0001234',
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
};

/** A seller with ALL KYC fields absent. */
const noKycSeller = {
  ...fullSeller,
  id: 'clr0000000001',
  bankAccountNo: null,
  gstin: null,
  pan: null,
  bankIfsc: null,
  kycVerifiedAt: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toSellerView', () => {
  describe('full seller — all KYC fields populated', () => {
    it('passes through non-KYC scalar fields unchanged', () => {
      const view = toSellerView(fullSeller);

      expect(view.id).toBe(fullSeller.id);
      expect(view.displayName).toBe(fullSeller.displayName);
      expect(view.slug).toBe(fullSeller.slug);
      expect(view.description).toBe(fullSeller.description);
      expect(view.logoUrl).toBe(fullSeller.logoUrl);
      expect(view.status).toBe(SellerStatus.ACTIVE);
      expect(view.kycVerifiedAt).toBe(KYC_DATE);
      expect(view.createdAt).toBe(BASE_DATE);
      expect(view.updatedAt).toBe(BASE_DATE);
    });

    it('masks bankAccountNo to last-4 with bullet prefix', () => {
      const view = toSellerView(fullSeller);
      expect(view.bankAccountLast4).toBe('••••1234');
    });

    it('sets gstinPresent, panPresent, bankIfscPresent to true when fields are non-empty strings', () => {
      const view = toSellerView(fullSeller);
      expect(view.gstinPresent).toBe(true);
      expect(view.panPresent).toBe(true);
      expect(view.bankIfscPresent).toBe(true);
    });

    it('does NOT contain raw gstin, pan, bankIfsc, or full bankAccountNo in JSON output (PII leak check)', () => {
      const view = toSellerView(fullSeller);
      const json = JSON.stringify(view);

      expect(json).not.toContain('22AAAAA0000A1Z5'); // raw gstin
      expect(json).not.toContain('AAAAA0000A'); // raw pan
      expect(json).not.toContain('SBIN0001234'); // raw bankIfsc
      expect(json).not.toContain('123456781234'); // full account number
    });
  });

  describe('seller with no KYC fields', () => {
    it('returns bankAccountLast4 as null when bankAccountNo is null', () => {
      const view = toSellerView(noKycSeller);
      expect(view.bankAccountLast4).toBeNull();
    });

    it('sets all presence flags to false when fields are null', () => {
      const view = toSellerView(noKycSeller);
      expect(view.gstinPresent).toBe(false);
      expect(view.panPresent).toBe(false);
      expect(view.bankIfscPresent).toBe(false);
    });
  });

  describe('bankAccountNo edge cases', () => {
    it('returns null for a short bankAccountNo (less than 4 chars)', () => {
      const view = toSellerView({ ...fullSeller, bankAccountNo: '12' });
      expect(view.bankAccountLast4).toBeNull();
    });

    it('returns null for a bankAccountNo that is exactly 3 chars', () => {
      const view = toSellerView({ ...fullSeller, bankAccountNo: '123' });
      expect(view.bankAccountLast4).toBeNull();
    });

    it('returns masked value for a bankAccountNo that is exactly 4 chars', () => {
      const view = toSellerView({ ...fullSeller, bankAccountNo: '1234' });
      expect(view.bankAccountLast4).toBe('••••1234');
    });
  });

  describe('presence flag edge cases', () => {
    it('returns false for gstinPresent when gstin is an empty string', () => {
      const view = toSellerView({ ...fullSeller, gstin: '' });
      expect(view.gstinPresent).toBe(false);
    });

    it('returns false for panPresent when pan is an empty string', () => {
      const view = toSellerView({ ...fullSeller, pan: '' });
      expect(view.panPresent).toBe(false);
    });

    it('returns false for bankIfscPresent when bankIfsc is an empty string', () => {
      const view = toSellerView({ ...fullSeller, bankIfsc: '' });
      expect(view.bankIfscPresent).toBe(false);
    });
  });

  describe('output shape invariants', () => {
    it('never exposes gstin, pan, bankIfsc, or bankAccountNo as output keys', () => {
      const view = toSellerView(fullSeller) as Record<string, unknown>;

      expect(Object.keys(view)).not.toContain('gstin');
      expect(Object.keys(view)).not.toContain('pan');
      expect(Object.keys(view)).not.toContain('bankIfsc');
      expect(Object.keys(view)).not.toContain('bankAccountNo');
    });
  });
});
