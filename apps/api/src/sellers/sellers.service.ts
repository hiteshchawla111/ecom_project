import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, Role, SellerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { FieldCipherService } from '../common/crypto/field-cipher';
import { SELLER_REGISTERED_AUDIT } from '../audit/audit-actions';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { toSellerView, SellerView } from './seller-mask';
import { SELLER_REGISTERED, SellerRegisteredEvent } from './seller-events';

// ---------------------------------------------------------------------------
// Input type (inline — DTO class + validation decorators live in the
// controller layer; added in a later task)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// UpdateSellerInput — all fields optional; status is intentionally absent
// (sellers cannot change their own status; that is an admin-only action)
// ---------------------------------------------------------------------------

export interface UpdateSellerInput {
  displayName?: string;
  description?: string | null;
  logoUrl?: string | null;
  /** Raw (unencrypted) GSTIN. Encrypted before persistence when provided. */
  gstin?: string;
  /** Raw (unencrypted) PAN. Encrypted before persistence when provided. */
  pan?: string;
  /** Raw (unencrypted) bank account number. Encrypted before persistence when provided. */
  bankAccountNo?: string;
  /** Raw (unencrypted) bank IFSC code. Encrypted before persistence when provided. */
  bankIfsc?: string;
}

export interface RegisterSellerInput {
  displayName: string;
  description?: string;
  logoUrl?: string;
  /** Raw (unencrypted) GSTIN. Encrypted before persistence. */
  gstin?: string;
  /** Raw (unencrypted) PAN. Encrypted before persistence. */
  pan?: string;
  /** Raw (unencrypted) bank account number. Encrypted before persistence. */
  bankAccountNo?: string;
  /** Raw (unencrypted) bank IFSC code. Encrypted before persistence. */
  bankIfsc?: string;
}

// ---------------------------------------------------------------------------
// Slug utilities
// ---------------------------------------------------------------------------

/**
 * Converts a display name into a URL-safe slug:
 *   - Lowercase
 *   - Non-alphanumeric characters → single hyphen
 *   - Leading/trailing hyphens trimmed
 *
 * Falls back to 'seller' when the result would be empty.
 */
function slugify(displayName: string): string {
  const raw = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw.length > 0 ? raw : 'seller';
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class SellersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly audit: AuditService,
    private readonly cipher: FieldCipherService,
  ) {}

  /**
   * Registers an already-authenticated user as a seller.
   *
   * Steps (all atomic via a single transaction):
   * 1. Derive a unique slug from displayName.
   * 2. Encrypt KYC fields that are present.
   * 3. Create the Seller row (status PENDING_REVIEW).
   * 4. Flip the User's role to SELLER.
   * 5. Write an audit log entry.
   *
   * After the transaction, emit SELLER_REGISTERED domain event.
   *
   * @throws ConflictException when the user already has a seller account (P2002
   *   unique violation on Seller.userId).
   */
  async register(
    actor: AccessTokenPayload,
    input: RegisterSellerInput,
  ): Promise<SellerView> {
    const { displayName } = input;

    // ------------------------------------------------------------------
    // 1. Derive a unique slug
    // ------------------------------------------------------------------
    const slug = await this.uniqueSlug(displayName, actor.sub);

    // ------------------------------------------------------------------
    // 2. Encrypt KYC fields (only those that are present non-empty strings)
    // ------------------------------------------------------------------
    const encGstin = encryptIfPresent(input.gstin, this.cipher);
    const encPan = encryptIfPresent(input.pan, this.cipher);
    const encBankAccountNo = encryptIfPresent(input.bankAccountNo, this.cipher);
    const encBankIfsc = encryptIfPresent(input.bankIfsc, this.cipher);

    // ------------------------------------------------------------------
    // 3–5. Atomic transaction: create seller + flip role + audit
    // ------------------------------------------------------------------
    let seller: Awaited<ReturnType<typeof this.prisma.seller.create>>;

    try {
      seller = await this.prisma.$transaction(async (tx) => {
        const created = await tx.seller.create({
          data: {
            userId: actor.sub,
            displayName,
            slug,
            description: input.description,
            logoUrl: input.logoUrl,
            status: SellerStatus.PENDING_REVIEW,
            gstin: encGstin,
            pan: encPan,
            bankAccountNo: encBankAccountNo,
            bankIfsc: encBankIfsc,
          },
        });

        await tx.user.update({
          where: { id: actor.sub },
          data: { role: Role.SELLER },
        });

        await this.audit.record(
          {
            actorId: actor.sub,
            action: SELLER_REGISTERED_AUDIT,
            entityType: 'Seller',
            entityId: created.id,
            // Metadata intentionally excludes KYC fields — no PII in audit log.
            metadata: { displayName },
          },
          tx,
        );

        return created;
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(this.resolveP2002Message(err));
      }
      throw err;
    }

    // ------------------------------------------------------------------
    // 6. Emit domain event (after tx commits, outside the try/catch)
    // ------------------------------------------------------------------
    this.events.emit(SELLER_REGISTERED, {
      sellerId: seller.id,
      userId: actor.sub,
      displayName,
    } satisfies SellerRegisteredEvent);

    // ------------------------------------------------------------------
    // 7. Return a masked view
    //
    // toSellerView expects DECRYPTED values for masking (last-4, presence
    // flags). The stored Seller row holds encrypted ciphertext, so we
    // override the KYC fields with the original plaintext from `input`.
    // This is safe: the view never returns raw KYC — it only exposes a
    // masked last-4 and presence booleans.
    // ------------------------------------------------------------------
    return toSellerView({
      ...seller,
      gstin: input.gstin ?? null,
      pan: input.pan ?? null,
      bankAccountNo: input.bankAccountNo ?? null,
      bankIfsc: input.bankIfsc ?? null,
    });
  }

  /**
   * Returns the caller's own seller profile as a masked SellerView.
   *
   * KYC fields are stored encrypted; they are decrypted before being passed
   * to toSellerView so that presence flags and the bank-account last-4 are
   * derived from meaningful plaintext.  Raw values are never exposed.
   *
   * @throws NotFoundException when the actor has no seller record.
   */
  async getMe(actor: AccessTokenPayload): Promise<SellerView> {
    const seller = await this.prisma.seller.findUnique({
      where: { userId: actor.sub },
    });

    if (!seller) {
      throw new NotFoundException('Seller profile not found');
    }

    return toSellerView({
      ...seller,
      gstin: decryptIfPresent(seller.gstin, this.cipher),
      pan: decryptIfPresent(seller.pan, this.cipher),
      bankAccountNo: decryptIfPresent(seller.bankAccountNo, this.cipher),
      bankIfsc: decryptIfPresent(seller.bankIfsc, this.cipher),
    });
  }

  /**
   * Updates the caller's own seller profile and returns the updated masked view.
   *
   * Rules:
   * - Only fields explicitly present in `input` are written; absent fields are
   *   not touched (avoids accidental overwrites).
   * - KYC fields provided in `input` are encrypted before storage.
   * - `slug` is left unchanged (set at registration; must remain stable).
   * - `status` is not in UpdateSellerInput — sellers cannot change their own status.
   *
   * @throws NotFoundException when the actor has no seller record.
   */
  async updateMe(
    actor: AccessTokenPayload,
    input: UpdateSellerInput,
  ): Promise<SellerView> {
    // Verify ownership / existence first.
    const existing = await this.prisma.seller.findUnique({
      where: { userId: actor.sub },
    });

    if (!existing) {
      throw new NotFoundException('Seller profile not found');
    }

    // Build a partial data object — only include fields that were explicitly
    // provided so we don't silently overwrite unrelated fields.
    const data: Record<string, unknown> = {};

    if ('displayName' in input && input.displayName !== undefined) {
      data['displayName'] = input.displayName;
    }
    if ('description' in input) {
      data['description'] = input.description ?? null;
    }
    if ('logoUrl' in input) {
      data['logoUrl'] = input.logoUrl ?? null;
    }

    // KYC: encrypt non-empty strings; treat an empty/absent value as "no-op"
    // (the encryptIfPresent helper returns undefined for empty/undefined values,
    // which keeps the field unchanged via Prisma's undefined-means-skip behaviour).
    if ('gstin' in input) {
      data['gstin'] = encryptIfPresent(input.gstin, this.cipher) ?? null;
    }
    if ('pan' in input) {
      data['pan'] = encryptIfPresent(input.pan, this.cipher) ?? null;
    }
    if ('bankAccountNo' in input) {
      data['bankAccountNo'] =
        encryptIfPresent(input.bankAccountNo, this.cipher) ?? null;
    }
    if ('bankIfsc' in input) {
      data['bankIfsc'] = encryptIfPresent(input.bankIfsc, this.cipher) ?? null;
    }

    const updated = await this.prisma.seller.update({
      where: { userId: actor.sub },
      data,
    });

    // Decrypt updated KYC for the masked view.
    return toSellerView({
      ...updated,
      gstin: decryptIfPresent(updated.gstin, this.cipher),
      pan: decryptIfPresent(updated.pan, this.cipher),
      bankAccountNo: decryptIfPresent(updated.bankAccountNo, this.cipher),
      bankIfsc: decryptIfPresent(updated.bankIfsc, this.cipher),
    });
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  /**
   * Maps a P2002 PrismaClientKnownRequestError to a user-facing message by
   * inspecting `err.meta.target`.
   *
   * Prisma sets `meta.target` to the field(s) involved in the unique
   * violation. It may be a `string[]` or a single `string` depending on the
   * connector version, so both shapes are handled defensively.
   *
   * - target includes "userId"  → seller-account conflict message.
   * - target includes "slug"    → slug/display-name conflict message.
   * - target absent/unrecognised → safe default (seller-account message).
   */
  private resolveP2002Message(
    err: Prisma.PrismaClientKnownRequestError,
  ): string {
    const meta = err.meta;
    const raw = meta?.['target'];

    // Normalise to a string array regardless of connector shape.
    const fields: string[] = Array.isArray(raw)
      ? raw.map(String)
      : typeof raw === 'string'
        ? [raw]
        : [];

    if (fields.includes('slug') && !fields.includes('userId')) {
      return 'A seller with a similar name already exists; please choose a different display name';
    }

    return 'You already have a seller account';
  }

  /**
   * Returns a slug derived from `displayName` that is not already taken.
   *
   * Uniqueness strategy:
   *   base → base-2 → base-3 → … (up to 50 attempts)
   *   If still taken after 50 attempts, append the last-6 chars of userId
   *   (deterministic, no Math.random).
   */
  private async uniqueSlug(
    displayName: string,
    userId: string,
  ): Promise<string> {
    const base = slugify(displayName);

    // First try the bare base slug.
    const taken = await this.prisma.seller.findUnique({
      where: { slug: base },
    });
    if (!taken) {
      return base;
    }

    // Try base-2, base-3, … base-50.
    for (let i = 2; i <= 50; i++) {
      const candidate = `${base}-${String(i)}`;
      const existing = await this.prisma.seller.findUnique({
        where: { slug: candidate },
      });
      if (!existing) {
        return candidate;
      }
    }

    // Deterministic fallback: append last-6 chars of userId.
    return `${base}-${userId.slice(-6)}`;
  }
}

// ---------------------------------------------------------------------------
// Module-private helper
// ---------------------------------------------------------------------------

/**
 * Encrypts the value if it is a non-empty string; otherwise returns undefined.
 */
function encryptIfPresent(
  value: string | undefined,
  cipher: FieldCipherService,
): string | undefined {
  if (typeof value === 'string' && value.length > 0) {
    return cipher.encryptField(value);
  }
  return undefined;
}

/**
 * Decrypts the stored ciphertext if it is a non-empty string; otherwise
 * returns null.  Inverse of encryptIfPresent — used to turn stored ciphertext
 * back into plaintext before passing to toSellerView for masking.
 */
function decryptIfPresent(
  value: string | null,
  cipher: FieldCipherService,
): string | null {
  if (typeof value === 'string' && value.length > 0) {
    return cipher.decryptField(value);
  }
  return null;
}
