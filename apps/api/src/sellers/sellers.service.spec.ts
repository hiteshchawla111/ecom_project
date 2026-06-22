/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { Prisma, Role, SellerStatus } from '@prisma/client';
import { SellersService, RegisterSellerInput } from './sellers.service';
import { SELLER_REGISTERED } from './seller-events';
import { SELLER_REGISTERED_AUDIT } from '../audit/audit-actions';
import type { AccessTokenPayload } from '../auth/auth-tokens';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

/**
 * Prisma mock.
 *
 * $transaction(cb) runs the callback with the same mock object so
 * assertions can target prisma.seller.create, prisma.user.update etc.
 */
const makePrisma = () => {
  const prisma: any = {
    seller: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    auditLog: { create: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (cb: (tx: any) => Promise<unknown>) =>
    cb(prisma),
  );
  return prisma;
};

const makeEvents = () => ({ emit: jest.fn() });
const makeAudit = () => ({ record: jest.fn().mockResolvedValue(undefined) });

/**
 * A minimal FieldCipherService mock.
 * encryptField returns a predictable ciphertext so tests can assert on it.
 */
const makeCipher = () => ({
  encryptField: jest.fn((plain: string) => `enc(${plain})`),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const actor: AccessTokenPayload = {
  sub: 'user-abc123456789',
  email: 'seller@example.com',
  role: Role.CUSTOMER,
};

const BASE_DATE = new Date('2024-06-01T00:00:00.000Z');

/** A seller row as returned by prisma.seller.create. */
const makeSeller = (overrides: Record<string, unknown> = {}) => ({
  id: 'seller-001',
  userId: actor.sub,
  displayName: 'Cool Shop',
  slug: 'cool-shop',
  description: null,
  logoUrl: null,
  status: SellerStatus.PENDING_REVIEW,
  gstin: null,
  pan: null,
  bankAccountNo: null,
  bankIfsc: null,
  kycVerifiedAt: null,
  commissionRate: null,
  createdAt: BASE_DATE,
  updatedAt: BASE_DATE,
  deletedAt: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Test harness builder
// ---------------------------------------------------------------------------

const build = () => {
  const prisma = makePrisma();
  const events = makeEvents();
  const audit = makeAudit();
  const cipher = makeCipher();
  const svc = new SellersService(
    prisma as never,
    events as never,
    audit as never,
    cipher as never,
  );
  return { svc, prisma, events, audit, cipher };
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SellersService.register', () => {
  describe('happy path — basic registration without KYC', () => {
    const input: RegisterSellerInput = { displayName: 'Cool Shop' };

    it('creates a Seller row with status PENDING_REVIEW and the correct slug', async () => {
      const { svc, prisma } = build();
      // Slug not taken
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(makeSeller());
      prisma.user.update.mockResolvedValue({});

      await svc.register(actor, input);

      expect(prisma.seller.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: actor.sub,
            displayName: 'Cool Shop',
            slug: 'cool-shop',
            status: SellerStatus.PENDING_REVIEW,
          }),
        }),
      );
    });

    it('flips the user role to SELLER inside the same transaction', async () => {
      const { svc, prisma } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(makeSeller());
      prisma.user.update.mockResolvedValue({});

      await svc.register(actor, input);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: actor.sub },
        data: { role: Role.SELLER },
      });
    });

    it('writes an audit entry with correct action, entityType, entityId, and actorId', async () => {
      const { svc, prisma, audit } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(makeSeller());
      prisma.user.update.mockResolvedValue({});

      await svc.register(actor, input);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: actor.sub,
          action: SELLER_REGISTERED_AUDIT,
          entityType: 'Seller',
          entityId: 'seller-001',
        }),
        expect.anything(), // tx client
      );
    });

    it('audit metadata contains displayName but NO KYC fields', async () => {
      const { svc, prisma, audit } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(makeSeller());
      prisma.user.update.mockResolvedValue({});

      await svc.register(actor, input);

      const [entry] = audit.record.mock.calls as Array<
        [{ metadata: Record<string, unknown> }]
      >;
      const metadata = entry[0].metadata;
      expect(metadata).toEqual(
        expect.objectContaining({ displayName: 'Cool Shop' }),
      );
      expect(Object.keys(metadata)).not.toContain('gstin');
      expect(Object.keys(metadata)).not.toContain('pan');
      expect(Object.keys(metadata)).not.toContain('bankAccountNo');
      expect(Object.keys(metadata)).not.toContain('bankIfsc');
    });

    it('emits SELLER_REGISTERED event AFTER the transaction commits', async () => {
      const { svc, prisma, events } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(makeSeller());
      prisma.user.update.mockResolvedValue({});

      await svc.register(actor, input);

      expect(events.emit).toHaveBeenCalledWith(SELLER_REGISTERED, {
        sellerId: 'seller-001',
        userId: actor.sub,
        displayName: 'Cool Shop',
      });
      // Event must be emitted after $transaction resolves.
      const txOrder = prisma.$transaction.mock.invocationCallOrder[0];
      const emitOrder = events.emit.mock.invocationCallOrder[0];
      expect(emitOrder).toBeGreaterThan(txOrder);
    });

    it('returns a SellerView without any raw KYC fields', async () => {
      const { svc, prisma } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(makeSeller());
      prisma.user.update.mockResolvedValue({});

      const view = await svc.register(actor, input);

      // Must have the standard view fields
      expect(view.id).toBe('seller-001');
      expect(view.displayName).toBe('Cool Shop');
      expect(view.slug).toBe('cool-shop');
      expect(view.status).toBe(SellerStatus.PENDING_REVIEW);

      // Must NOT expose raw KYC field keys (only masked/presence-flag variants allowed)
      const keys = Object.keys(view);
      expect(keys).not.toContain('bankAccountNo');
      expect(keys).not.toContain('gstin');
      expect(keys).not.toContain('pan');
      expect(keys).not.toContain('bankIfsc');
    });
  });

  describe('KYC field encryption', () => {
    it('encrypts each present KYC field before persisting', async () => {
      const { svc, prisma, cipher } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(
        makeSeller({
          gstin: 'enc(22AAAAA0000A1Z5)',
          pan: 'enc(AAAAA0000A)',
          bankAccountNo: 'enc(123456781234)',
          bankIfsc: 'enc(SBIN0001234)',
        }),
      );
      prisma.user.update.mockResolvedValue({});

      const kycInput: RegisterSellerInput = {
        displayName: 'Cool Shop',
        gstin: '22AAAAA0000A1Z5',
        pan: 'AAAAA0000A',
        bankAccountNo: '123456781234',
        bankIfsc: 'SBIN0001234',
      };
      await svc.register(actor, kycInput);

      // cipher.encryptField must have been called with each raw KYC value.
      expect(cipher.encryptField).toHaveBeenCalledWith('22AAAAA0000A1Z5');
      expect(cipher.encryptField).toHaveBeenCalledWith('AAAAA0000A');
      expect(cipher.encryptField).toHaveBeenCalledWith('123456781234');
      expect(cipher.encryptField).toHaveBeenCalledWith('SBIN0001234');

      // And the encrypted values must appear in the create call.
      const [createCall] = prisma.seller.create.mock.calls as Array<
        [{ data: Record<string, unknown> }]
      >;
      expect(createCall[0].data.gstin).toBe('enc(22AAAAA0000A1Z5)');
      expect(createCall[0].data.pan).toBe('enc(AAAAA0000A)');
      expect(createCall[0].data.bankAccountNo).toBe('enc(123456781234)');
      expect(createCall[0].data.bankIfsc).toBe('enc(SBIN0001234)');
    });

    it('does not call encryptField for absent KYC fields', async () => {
      const { svc, prisma, cipher } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(makeSeller());
      prisma.user.update.mockResolvedValue({});

      await svc.register(actor, { displayName: 'Cool Shop' });

      expect(cipher.encryptField).not.toHaveBeenCalled();
    });

    it('bankAccountLast4 in the returned view is derived from the PLAINTEXT (not the ciphertext)', async () => {
      const { svc, prisma } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      // Simulate the stored ciphertext in the returned DB row.
      prisma.seller.create.mockResolvedValue(
        makeSeller({
          bankAccountNo: 'enc(123456781234)',
        }),
      );
      prisma.user.update.mockResolvedValue({});

      const view = await svc.register(actor, {
        displayName: 'Cool Shop',
        bankAccountNo: '123456781234',
      });

      // The view should show the last-4 of the PLAINTEXT account number.
      expect(view.bankAccountLast4).toBe('••••1234');
    });
  });

  describe('slug uniqueness', () => {
    it('slugifies the display name correctly (Cool Shop → cool-shop)', async () => {
      const { svc, prisma } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockResolvedValue(makeSeller({ slug: 'cool-shop' }));
      prisma.user.update.mockResolvedValue({});

      await svc.register(actor, { displayName: 'Cool Shop' });

      const [createCall] = prisma.seller.create.mock.calls as Array<
        [{ data: { slug: string } }]
      >;
      expect(createCall[0].data.slug).toBe('cool-shop');
    });

    it('appends -2 when the base slug is already taken', async () => {
      const { svc, prisma } = build();
      // First findUnique (for 'cool-shop') returns an existing seller.
      // Second findUnique (for 'cool-shop-2') returns null → free.
      prisma.seller.findUnique
        .mockResolvedValueOnce({ id: 'existing-seller' })
        .mockResolvedValueOnce(null);
      prisma.seller.create.mockResolvedValue(
        makeSeller({ slug: 'cool-shop-2' }),
      );
      prisma.user.update.mockResolvedValue({});

      await svc.register(actor, { displayName: 'Cool Shop' });

      const [createCall] = prisma.seller.create.mock.calls as Array<
        [{ data: { slug: string } }]
      >;
      expect(createCall[0].data.slug).toBe('cool-shop-2');
    });
  });

  describe('error handling', () => {
    it('throws ConflictException (409) with seller-account message when userId P2002 fires', async () => {
      const { svc, prisma } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'x',
          meta: { target: ['userId'] },
        }),
      );

      await expect(
        svc.register(actor, { displayName: 'Cool Shop' }),
      ).rejects.toMatchObject({
        message: 'You already have a seller account',
      });
    });

    it('throws ConflictException (409) with slug-specific message when slug P2002 fires', async () => {
      const { svc, prisma } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'x',
          meta: { target: ['slug'] },
        }),
      );

      await expect(
        svc.register(actor, { displayName: 'Cool Shop' }),
      ).rejects.toMatchObject({
        message:
          'A seller with a similar name already exists; please choose a different display name',
      });
    });

    it('re-throws non-P2002 Prisma errors unchanged', async () => {
      const { svc, prisma } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      const dbError = new Prisma.PrismaClientKnownRequestError('FK violation', {
        code: 'P2003',
        clientVersion: 'x',
      });
      prisma.seller.create.mockRejectedValue(dbError);

      await expect(
        svc.register(actor, { displayName: 'Cool Shop' }),
      ).rejects.toBe(dbError);
    });

    it('does NOT emit any event when the transaction fails', async () => {
      const { svc, prisma, events } = build();
      prisma.seller.findUnique.mockResolvedValue(null);
      prisma.seller.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: 'x',
        }),
      );

      await expect(
        svc.register(actor, { displayName: 'Cool Shop' }),
      ).rejects.toThrow();

      expect(events.emit).not.toHaveBeenCalled();
    });
  });
});
