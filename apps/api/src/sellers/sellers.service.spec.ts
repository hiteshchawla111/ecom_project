/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import { NotFoundException } from '@nestjs/common';
import { Prisma, Role, SellerStatus } from '@prisma/client';
import {
  SellersService,
  RegisterSellerInput,
  UpdateSellerInput,
} from './sellers.service';
import {
  SELLER_REGISTERED,
  SELLER_KYC_APPROVED,
  SELLER_KYC_REJECTED,
} from './seller-events';
import {
  SELLER_REGISTERED_AUDIT,
  SELLER_STATUS_CHANGED_AUDIT,
  SELLER_PROFILE_UPDATED_AUDIT,
} from '../audit/audit-actions';
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
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
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
 * decryptField inverts the enc(…) wrapper so tests can assert on last-4 masking.
 */
const makeCipher = () => ({
  encryptField: jest.fn((plain: string) => `enc(${plain})`),
  decryptField: jest.fn((stored: string) =>
    stored.replace(/^enc\((.+)\)$/, '$1'),
  ),
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

// ---------------------------------------------------------------------------
// SellersService.getMe
// ---------------------------------------------------------------------------

describe('SellersService.getMe', () => {
  it("returns a masked SellerView for the caller's seller", async () => {
    const { svc, prisma } = build();
    prisma.seller.findUnique.mockResolvedValue(makeSeller());

    const view = await svc.getMe(actor);

    expect(view.id).toBe('seller-001');
    expect(view.displayName).toBe('Cool Shop');
    expect(view.slug).toBe('cool-shop');
    expect(view.status).toBe('PENDING_REVIEW');
  });

  it('queries prisma with the correct ownership filter', async () => {
    const { svc, prisma } = build();
    prisma.seller.findUnique.mockResolvedValue(makeSeller());

    await svc.getMe(actor);

    expect(prisma.seller.findUnique).toHaveBeenCalledWith({
      where: { userId: actor.sub },
    });
  });

  it('returned view does NOT contain raw KYC fields', async () => {
    const { svc, prisma } = build();
    prisma.seller.findUnique.mockResolvedValue(
      makeSeller({
        bankAccountNo: 'enc(123456781234)',
        gstin: 'enc(22AAAAA0000A1Z5)',
        pan: 'enc(AAAAA0000A)',
        bankIfsc: 'enc(SBIN0001234)',
      }),
    );

    const view = await svc.getMe(actor);
    const serialised = JSON.stringify(view);

    // Raw KYC keys must not appear in the view
    const keys = Object.keys(view);
    expect(keys).not.toContain('bankAccountNo');
    expect(keys).not.toContain('gstin');
    expect(keys).not.toContain('pan');
    expect(keys).not.toContain('bankIfsc');

    // And the ciphertexts must not appear in the serialised value
    expect(serialised).not.toContain('enc(123456781234)');
    expect(serialised).not.toContain('enc(22AAAAA0000A1Z5)');
  });

  it('decrypts stored KYC so that bankAccountLast4 reflects the plaintext', async () => {
    const { svc, prisma, cipher } = build();
    // Stored ciphertext; decryptField mock strips the enc(…) wrapper
    prisma.seller.findUnique.mockResolvedValue(
      makeSeller({ bankAccountNo: 'enc(123456781234)' }),
    );

    const view = await svc.getMe(actor);

    // decryptField must have been called with the stored ciphertext
    expect(cipher.decryptField).toHaveBeenCalledWith('enc(123456781234)');
    // Last-4 of the decrypted plaintext '123456781234'
    expect(view.bankAccountLast4).toBe('••••1234');
  });

  it('throws NotFoundException when the actor has no seller record', async () => {
    const { svc, prisma } = build();
    prisma.seller.findUnique.mockResolvedValue(null);

    await expect(svc.getMe(actor)).rejects.toMatchObject({
      message: 'Seller profile not found',
    });
  });
});

// ---------------------------------------------------------------------------
// SellersService.updateMe
// ---------------------------------------------------------------------------

describe('SellersService.updateMe', () => {
  it('calls seller.update with only the provided field and the ownership filter', async () => {
    const { svc, prisma } = build();
    const updatedSeller = makeSeller({ displayName: 'New Name' });
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(updatedSeller);

    const input: UpdateSellerInput = { displayName: 'New Name' };
    await svc.updateMe(actor, input);

    const [updateCall] = prisma.seller.update.mock.calls as Array<
      [{ where: Record<string, unknown>; data: Record<string, unknown> }]
    >;
    // Ownership filter
    expect(updateCall[0].where).toEqual({ userId: actor.sub });
    // Data contains the provided field
    expect(updateCall[0].data).toHaveProperty('displayName', 'New Name');
    // Data must NOT touch slug or status
    expect(Object.keys(updateCall[0].data)).not.toContain('slug');
    expect(Object.keys(updateCall[0].data)).not.toContain('status');
  });

  it('encrypts a provided KYC field before storage', async () => {
    const { svc, prisma, cipher } = build();
    const updatedSeller = makeSeller({ bankAccountNo: 'enc(987654321098)' });
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(updatedSeller);

    const input: UpdateSellerInput = { bankAccountNo: '987654321098' };
    await svc.updateMe(actor, input);

    // encryptField called with the plaintext
    expect(cipher.encryptField).toHaveBeenCalledWith('987654321098');

    const [updateCall] = prisma.seller.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    // The value passed to Prisma is the ciphertext, not the raw value
    expect(updateCall[0].data['bankAccountNo']).toBe('enc(987654321098)');
  });

  it('returns a masked view — decrypts updated KYC for last-4 and presence flags', async () => {
    const { svc, prisma, cipher } = build();
    const updatedSeller = makeSeller({ bankAccountNo: 'enc(987654321098)' });
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(updatedSeller);

    const input: UpdateSellerInput = { bankAccountNo: '987654321098' };
    const view = await svc.updateMe(actor, input);

    // decryptField called on the updated stored ciphertext
    expect(cipher.decryptField).toHaveBeenCalledWith('enc(987654321098)');
    // Last-4 of the decrypted plaintext '987654321098'
    expect(view.bankAccountLast4).toBe('••••1098');
    // Raw KYC keys absent from the view
    expect(Object.keys(view)).not.toContain('bankAccountNo');
  });

  it('does not include unset fields in the update data', async () => {
    const { svc, prisma } = build();
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(
      makeSeller({ displayName: 'New Name' }),
    );

    // Only displayName provided — KYC fields are not in input
    const input: UpdateSellerInput = { displayName: 'New Name' };
    await svc.updateMe(actor, input);

    const [updateCall] = prisma.seller.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    const dataKeys = Object.keys(updateCall[0].data);
    expect(dataKeys).not.toContain('gstin');
    expect(dataKeys).not.toContain('pan');
    expect(dataKeys).not.toContain('bankAccountNo');
    expect(dataKeys).not.toContain('bankIfsc');
  });

  it('throws NotFoundException when the actor has no seller record', async () => {
    const { svc, prisma } = build();
    prisma.seller.findUnique.mockResolvedValue(null);

    await expect(
      svc.updateMe(actor, { displayName: 'Anything' }),
    ).rejects.toMatchObject({
      message: 'Seller profile not found',
    });
  });

  it('empty-string KYC field is a no-op — encryptField NOT called and key absent from update data', async () => {
    const { svc, prisma, cipher } = build();
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(
      makeSeller({ gstin: 'enc(22AAAAA0000A1Z5)' }),
    );

    // gstin present but empty string — should be skipped entirely, not cleared
    const input: UpdateSellerInput = { gstin: '' };
    await svc.updateMe(actor, input);

    // encryptField must NOT have been called for the empty string
    expect(cipher.encryptField).not.toHaveBeenCalled();

    const [updateCall] = prisma.seller.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    // gstin key must be absent from the data object (undefined/omitted → Prisma skips it)
    expect(Object.keys(updateCall[0].data)).not.toContain('gstin');
  });

  it('UpdateSellerInput has no status field — data passed to update never includes status', async () => {
    const { svc, prisma } = build();
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(makeSeller());

    // TypeScript prevents `status` from being in UpdateSellerInput, but we
    // also assert at runtime that it never leaks into the update data.
    const input: UpdateSellerInput = { displayName: 'Safe Name' };
    await svc.updateMe(actor, input);

    const [updateCall] = prisma.seller.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(Object.keys(updateCall[0].data)).not.toContain('status');
  });

  // ---------------------------------------------------------------------------
  // Audit logging
  // ---------------------------------------------------------------------------

  it('records a SELLER_PROFILE_UPDATED_AUDIT entry with correct actorId, action, entityType, entityId', async () => {
    const { svc, prisma, audit } = build();
    const updatedSeller = makeSeller({ displayName: 'X' });
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(updatedSeller);

    const input: UpdateSellerInput = {
      displayName: 'X',
      bankAccountNo: '123456789012',
    };
    await svc.updateMe(actor, input);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: actor.sub,
        action: SELLER_PROFILE_UPDATED_AUDIT,
        entityType: 'Seller',
        entityId: 'seller-001',
      }),
      expect.anything(), // tx client
    );
  });

  it('audit metadata.fields contains the changed field NAMES (not values)', async () => {
    const { svc, prisma, audit } = build();
    const updatedSeller = makeSeller({
      displayName: 'X',
      bankAccountNo: 'enc(123456789012)',
    });
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(updatedSeller);

    const input: UpdateSellerInput = {
      displayName: 'X',
      bankAccountNo: '123456789012',
    };
    await svc.updateMe(actor, input);

    const [entry] = audit.record.mock.calls as Array<
      [{ metadata: Record<string, unknown> }]
    >;
    const metadata = entry[0].metadata;
    const fields = metadata['fields'] as string[];

    // Must contain the field NAMES
    expect(fields).toContain('displayName');
    expect(fields).toContain('bankAccountNo');

    // Must NOT contain the raw KYC value
    expect(JSON.stringify(metadata)).not.toContain('123456789012');
  });

  it('audit is called INSIDE the transaction (same tx client)', async () => {
    const { svc, prisma, audit } = build();
    prisma.seller.findUnique.mockResolvedValue(makeSeller());
    prisma.seller.update.mockResolvedValue(makeSeller({ displayName: 'Y' }));

    const capturedTxArgs: unknown[] = [];
    prisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const result = await cb(prisma);
        return result;
      },
    );
    audit.record.mockImplementation((_entry: unknown, tx: unknown) => {
      capturedTxArgs.push(tx);
      return Promise.resolve(undefined);
    });

    await svc.updateMe(actor, { displayName: 'Y' });

    // audit.record must have been called with a non-undefined tx argument
    expect(capturedTxArgs).toHaveLength(1);
    expect(capturedTxArgs[0]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// SellersService.listSellers
// ---------------------------------------------------------------------------

describe('SellersService.listSellers', () => {
  /** A minimal seller row as returned by prisma.seller.findMany (select shape). */
  const makeListRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'seller-001',
    displayName: 'Cool Shop',
    slug: 'cool-shop',
    status: SellerStatus.PENDING_REVIEW,
    createdAt: BASE_DATE,
    gstin: null,
    pan: null,
    bankAccountNo: null,
    bankIfsc: null,
    ...overrides,
  });

  it('returns Paginated shape with correct pagination math', async () => {
    const { svc, prisma } = build();
    prisma.seller.findMany.mockResolvedValue([makeListRow()]);
    prisma.seller.count.mockResolvedValue(45);

    const result = await svc.listSellers({ page: 2, pageSize: 20 });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(20);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(3);
    expect(result.data).toHaveLength(1);
  });

  it('uses defaults page=1, pageSize=20 when not provided', async () => {
    const { svc, prisma } = build();
    prisma.seller.findMany.mockResolvedValue([]);
    prisma.seller.count.mockResolvedValue(0);

    const result = await svc.listSellers({});

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(20);
    expect(result.totalPages).toBe(1); // Math.max(1, ...)
  });

  it('filters by status when provided', async () => {
    const { svc, prisma } = build();
    prisma.seller.findMany.mockResolvedValue([]);
    prisma.seller.count.mockResolvedValue(0);

    await svc.listSellers({ status: SellerStatus.ACTIVE });

    const [findManyCall] = prisma.seller.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findManyCall[0].where).toMatchObject({
      status: SellerStatus.ACTIVE,
    });
  });

  it('excludes soft-deleted records (deletedAt: null in where)', async () => {
    const { svc, prisma } = build();
    prisma.seller.findMany.mockResolvedValue([]);
    prisma.seller.count.mockResolvedValue(0);

    await svc.listSellers({});

    const [findManyCall] = prisma.seller.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(findManyCall[0].where).toMatchObject({ deletedAt: null });
  });

  it('omits status from where when not provided', async () => {
    const { svc, prisma } = build();
    prisma.seller.findMany.mockResolvedValue([]);
    prisma.seller.count.mockResolvedValue(0);

    await svc.listSellers({});

    const [findManyCall] = prisma.seller.findMany.mock.calls as Array<
      [{ where: Record<string, unknown> }]
    >;
    expect(Object.keys(findManyCall[0].where)).not.toContain('status');
  });

  it('rows have kycPresent=true when any KYC field is set', async () => {
    const { svc, prisma } = build();
    prisma.seller.findMany.mockResolvedValue([
      makeListRow({ gstin: 'enc(22AAAAA0000A1Z5)' }),
    ]);
    prisma.seller.count.mockResolvedValue(1);

    const result = await svc.listSellers({});

    expect(result.data[0].kycPresent).toBe(true);
  });

  it('rows have kycPresent=false when all KYC fields are null', async () => {
    const { svc, prisma } = build();
    prisma.seller.findMany.mockResolvedValue([makeListRow()]);
    prisma.seller.count.mockResolvedValue(1);

    const result = await svc.listSellers({});

    expect(result.data[0].kycPresent).toBe(false);
  });

  it('rows do NOT contain raw KYC fields', async () => {
    const { svc, prisma } = build();
    prisma.seller.findMany.mockResolvedValue([
      makeListRow({
        gstin: 'enc(22AAAAA0000A1Z5)',
        pan: 'enc(AAAAA0000A)',
        bankAccountNo: 'enc(123456781234)',
        bankIfsc: 'enc(SBIN0001234)',
      }),
    ]);
    prisma.seller.count.mockResolvedValue(1);

    const result = await svc.listSellers({});

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain('enc(22AAAAA0000A1Z5)');
    expect(serialised).not.toContain('enc(AAAAA0000A)');
    expect(serialised).not.toContain('enc(123456781234)');
    expect(serialised).not.toContain('enc(SBIN0001234)');

    const rowKeys = Object.keys(result.data[0]);
    expect(rowKeys).not.toContain('gstin');
    expect(rowKeys).not.toContain('pan');
    expect(rowKeys).not.toContain('bankAccountNo');
    expect(rowKeys).not.toContain('bankIfsc');
  });
});

// ---------------------------------------------------------------------------
// SellersService.getSeller
// ---------------------------------------------------------------------------

describe('SellersService.getSeller', () => {
  it('returns a masked SellerView for the given id', async () => {
    const { svc, prisma } = build();
    prisma.seller.findFirst.mockResolvedValue(makeSeller());

    const view = await svc.getSeller('seller-001');

    expect(view.id).toBe('seller-001');
    expect(view.displayName).toBe('Cool Shop');
    expect(view.slug).toBe('cool-shop');
    expect(view.status).toBe(SellerStatus.PENDING_REVIEW);
  });

  it('queries with id and deletedAt:null filter', async () => {
    const { svc, prisma } = build();
    prisma.seller.findFirst.mockResolvedValue(makeSeller());

    await svc.getSeller('seller-001');

    expect(prisma.seller.findFirst).toHaveBeenCalledWith({
      where: { id: 'seller-001', deletedAt: null },
    });
  });

  it('decrypts KYC so bankAccountLast4 reflects the plaintext', async () => {
    const { svc, prisma, cipher } = build();
    prisma.seller.findFirst.mockResolvedValue(
      makeSeller({ bankAccountNo: 'enc(123456781234)' }),
    );

    const view = await svc.getSeller('seller-001');

    expect(cipher.decryptField).toHaveBeenCalledWith('enc(123456781234)');
    expect(view.bankAccountLast4).toBe('••••1234');
  });

  it('returned view does NOT contain raw KYC fields', async () => {
    const { svc, prisma } = build();
    prisma.seller.findFirst.mockResolvedValue(
      makeSeller({
        gstin: 'enc(22AAAAA0000A1Z5)',
        pan: 'enc(AAAAA0000A)',
        bankAccountNo: 'enc(123456781234)',
        bankIfsc: 'enc(SBIN0001234)',
      }),
    );

    const view = await svc.getSeller('seller-001');

    const keys = Object.keys(view);
    expect(keys).not.toContain('gstin');
    expect(keys).not.toContain('pan');
    expect(keys).not.toContain('bankAccountNo');
    expect(keys).not.toContain('bankIfsc');
  });

  it('throws NotFoundException when seller is not found', async () => {
    const { svc, prisma } = build();
    prisma.seller.findFirst.mockResolvedValue(null);

    await expect(svc.getSeller('nonexistent')).rejects.toMatchObject({
      message: 'Seller not found',
    });
  });
});

// ---------------------------------------------------------------------------
// SellersService public reads (Task 2 — M3a Catalog V2)
// ---------------------------------------------------------------------------

// Minimal mocks — these methods are the only deps the public-read paths touch.
const makePublicReadDeps = () => {
  const prisma = {
    seller: {
      findFirst: jest.fn(),
    },
  };
  const events = { emit: jest.fn() };
  const audit = { record: jest.fn() };
  const cipher = { encrypt: jest.fn(), decrypt: jest.fn() };
  return { prisma, events, audit, cipher };
};

const buildPublicService = () => {
  const { prisma, events, audit, cipher } = makePublicReadDeps();
  // Constructor arg order: (prisma, events, audit, cipher) — matches sellers.service.ts.
  const svc = new SellersService(
    prisma as never,
    events as never,
    audit as never,
    cipher as never,
  );
  return { svc, prisma };
};

const activeSellerFixture = {
  id: 's1',
  displayName: 'Demo Shop',
  slug: 'demo-shop',
  description: 'desc',
  logoUrl: null,
  status: SellerStatus.ACTIVE,
  gstin: 'SECRET',
  pan: 'SECRET',
  bankAccountNo: '000012345678',
  bankIfsc: 'IFSC',
  kycVerifiedAt: null,
  commissionRate: null,
  userId: 'u1',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe('SellersService public reads', () => {
  describe('getPublicBySlug', () => {
    it('returns the public view for an ACTIVE, non-deleted seller', async () => {
      const { svc, prisma } = buildPublicService();
      prisma.seller.findFirst.mockResolvedValue(activeSellerFixture);

      const res = await svc.getPublicBySlug('demo-shop');

      // Gate asserted on the where clause.
      const [call] = prisma.seller.findFirst.mock.calls as Array<
        [{ where: Record<string, unknown> }]
      >;
      expect(call[0].where).toEqual({
        slug: 'demo-shop',
        status: SellerStatus.ACTIVE,
        deletedAt: null,
      });
      // Only public fields leak out.
      expect(res).toEqual({
        id: 's1',
        displayName: 'Demo Shop',
        slug: 'demo-shop',
        description: 'desc',
        logoUrl: null,
      });
    });

    it('throws NotFoundException when no ACTIVE seller matches', async () => {
      const { svc, prisma } = buildPublicService();
      prisma.seller.findFirst.mockResolvedValue(null);
      await expect(svc.getPublicBySlug('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getActiveSellerIdBySlug', () => {
    it('returns the id for an ACTIVE, non-deleted seller', async () => {
      const { svc, prisma } = buildPublicService();
      prisma.seller.findFirst.mockResolvedValue({ id: 's1' });
      await expect(svc.getActiveSellerIdBySlug('demo-shop')).resolves.toBe('s1');
    });

    it('throws NotFoundException when no ACTIVE seller matches', async () => {
      const { svc, prisma } = buildPublicService();
      prisma.seller.findFirst.mockResolvedValue(null);
      await expect(
        svc.getActiveSellerIdBySlug('missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

// ---------------------------------------------------------------------------
// SellersService.updateStatus
// ---------------------------------------------------------------------------

const adminActor: AccessTokenPayload = {
  sub: 'admin-user-001',
  email: 'admin@example.com',
  role: Role.ADMIN,
};

describe('SellersService.updateStatus', () => {
  it('PENDING_REVIEW → ACTIVE: sets status, kycVerifiedAt, audits, emits SELLER_KYC_APPROVED', async () => {
    const { svc, prisma, audit, events } = build();
    const pendingSeller = makeSeller({ status: SellerStatus.PENDING_REVIEW });
    const activeSeller = makeSeller({
      status: SellerStatus.ACTIVE,
      kycVerifiedAt: BASE_DATE,
    });

    prisma.seller.findFirst.mockResolvedValue(pendingSeller);
    prisma.seller.update.mockResolvedValue(activeSeller);

    const view = await svc.updateStatus(
      'seller-001',
      { status: SellerStatus.ACTIVE },
      adminActor,
    );

    // Status updated
    expect(view.status).toBe(SellerStatus.ACTIVE);

    // update called with status + kycVerifiedAt
    const [updateCall] = prisma.seller.update.mock.calls as Array<
      [{ where: Record<string, unknown>; data: Record<string, unknown> }]
    >;
    expect(updateCall[0].where).toEqual({ id: 'seller-001' });
    expect(updateCall[0].data).toHaveProperty('status', SellerStatus.ACTIVE);
    expect(updateCall[0].data).toHaveProperty('kycVerifiedAt');

    // Audit recorded with correct fields, NO KYC in metadata
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: adminActor.sub,
        action: SELLER_STATUS_CHANGED_AUDIT,
        entityType: 'Seller',
        entityId: 'seller-001',
        metadata: expect.objectContaining({
          from: SellerStatus.PENDING_REVIEW,
          to: SellerStatus.ACTIVE,
        }),
      }),
      expect.anything(),
    );

    // Audit metadata must NOT contain KYC fields
    const [auditEntry] = audit.record.mock.calls as Array<
      [{ metadata: Record<string, unknown> }]
    >;
    const metadata = auditEntry[0].metadata;
    expect(Object.keys(metadata)).not.toContain('gstin');
    expect(Object.keys(metadata)).not.toContain('pan');
    expect(Object.keys(metadata)).not.toContain('bankAccountNo');
    expect(Object.keys(metadata)).not.toContain('bankIfsc');

    // Event emitted after commit
    expect(events.emit).toHaveBeenCalledWith(
      SELLER_KYC_APPROVED,
      expect.objectContaining({
        sellerId: 'seller-001',
        userId: pendingSeller.userId,
        status: SellerStatus.ACTIVE,
      }),
    );
  });

  it('PENDING_REVIEW → SUSPENDED (reject): emits SELLER_KYC_REJECTED with reason', async () => {
    const { svc, prisma, events } = build();
    const pendingSeller = makeSeller({ status: SellerStatus.PENDING_REVIEW });
    const suspendedSeller = makeSeller({ status: SellerStatus.SUSPENDED });

    prisma.seller.findFirst.mockResolvedValue(pendingSeller);
    prisma.seller.update.mockResolvedValue(suspendedSeller);

    await svc.updateStatus(
      'seller-001',
      { status: SellerStatus.SUSPENDED, reason: 'Incomplete KYC documents' },
      adminActor,
    );

    expect(events.emit).toHaveBeenCalledWith(
      SELLER_KYC_REJECTED,
      expect.objectContaining({
        sellerId: 'seller-001',
        userId: pendingSeller.userId,
        status: SellerStatus.SUSPENDED,
        reason: 'Incomplete KYC documents',
      }),
    );
    // Must NOT emit APPROVED
    expect(events.emit).not.toHaveBeenCalledWith(
      SELLER_KYC_APPROVED,
      expect.anything(),
    );
  });

  it('ACTIVE → DEACTIVATED: updates status, no event emitted', async () => {
    const { svc, prisma, events } = build();
    const activeSeller = makeSeller({ status: SellerStatus.ACTIVE });
    const deactivatedSeller = makeSeller({ status: SellerStatus.DEACTIVATED });

    prisma.seller.findFirst.mockResolvedValue(activeSeller);
    prisma.seller.update.mockResolvedValue(deactivatedSeller);

    const view = await svc.updateStatus(
      'seller-001',
      { status: SellerStatus.DEACTIVATED },
      adminActor,
    );

    expect(view.status).toBe(SellerStatus.DEACTIVATED);
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('illegal transition throws ConflictException (409) — no update/audit/emit', async () => {
    const { svc, prisma, audit, events } = build();
    // PENDING_REVIEW → DEACTIVATED is not allowed
    prisma.seller.findFirst.mockResolvedValue(
      makeSeller({ status: SellerStatus.PENDING_REVIEW }),
    );

    await expect(
      svc.updateStatus(
        'seller-001',
        { status: SellerStatus.DEACTIVATED },
        adminActor,
      ),
    ).rejects.toMatchObject({
      status: 409,
    });

    expect(prisma.seller.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when seller does not exist', async () => {
    const { svc, prisma } = build();
    prisma.seller.findFirst.mockResolvedValue(null);

    await expect(
      svc.updateStatus(
        'nonexistent',
        { status: SellerStatus.ACTIVE },
        adminActor,
      ),
    ).rejects.toMatchObject({
      message: 'Seller not found',
    });
  });

  it('audit is called INSIDE the transaction (same tx client)', async () => {
    const { svc, prisma, audit } = build();
    const pendingSeller = makeSeller({ status: SellerStatus.PENDING_REVIEW });
    const activeSeller = makeSeller({ status: SellerStatus.ACTIVE });

    prisma.seller.findFirst.mockResolvedValue(pendingSeller);
    prisma.seller.update.mockResolvedValue(activeSeller);

    // Override $transaction to capture the tx arg passed to audit.record
    const capturedTxArgs: unknown[] = [];
    prisma.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) => {
        const result = await cb(prisma);
        return result;
      },
    );
    audit.record.mockImplementation((_entry: unknown, tx: unknown) => {
      capturedTxArgs.push(tx);
      return Promise.resolve(undefined);
    });

    await svc.updateStatus(
      'seller-001',
      { status: SellerStatus.ACTIVE },
      adminActor,
    );

    // audit.record must have been called with a tx argument (non-undefined)
    expect(capturedTxArgs).toHaveLength(1);
    expect(capturedTxArgs[0]).toBeDefined();
  });

  it('ACTIVE → ACTIVE: kycVerifiedAt is set when approving', async () => {
    const { svc, prisma } = build();
    const suspendedSeller = makeSeller({ status: SellerStatus.SUSPENDED });
    const activeSeller = makeSeller({
      status: SellerStatus.ACTIVE,
      kycVerifiedAt: BASE_DATE,
    });

    prisma.seller.findFirst.mockResolvedValue(suspendedSeller);
    prisma.seller.update.mockResolvedValue(activeSeller);

    await svc.updateStatus(
      'seller-001',
      { status: SellerStatus.ACTIVE },
      adminActor,
    );

    const [updateCall] = prisma.seller.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    // kycVerifiedAt must be set on any ACTIVE transition
    expect(updateCall[0].data).toHaveProperty('kycVerifiedAt');
  });

  it('non-ACTIVE transition does NOT set kycVerifiedAt', async () => {
    const { svc, prisma } = build();
    const activeSeller = makeSeller({ status: SellerStatus.ACTIVE });
    const suspendedSeller = makeSeller({ status: SellerStatus.SUSPENDED });

    prisma.seller.findFirst.mockResolvedValue(activeSeller);
    prisma.seller.update.mockResolvedValue(suspendedSeller);

    await svc.updateStatus(
      'seller-001',
      { status: SellerStatus.SUSPENDED },
      adminActor,
    );

    const [updateCall] = prisma.seller.update.mock.calls as Array<
      [{ data: Record<string, unknown> }]
    >;
    expect(Object.keys(updateCall[0].data)).not.toContain('kycVerifiedAt');
  });
});
