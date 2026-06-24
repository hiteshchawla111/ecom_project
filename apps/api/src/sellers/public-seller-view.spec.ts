import { SellerStatus } from '@prisma/client';
import { toPublicSellerView } from './public-seller-view';

describe('toPublicSellerView', () => {
  it('returns exactly the 5 public fields and nothing else', () => {
    // A full seller row, including fields that must NOT leak publicly.
    const fullSeller = {
      id: 's1',
      displayName: 'Demo Shop',
      slug: 'demo-shop',
      description: 'We sell demo things',
      logoUrl: 'https://cdn.example.com/logo.png',
      status: SellerStatus.ACTIVE,
      gstin: 'SECRET-GSTIN',
      pan: 'SECRET-PAN',
      bankAccountNo: '000012345678',
      bankIfsc: 'HDFC0001234',
      kycVerifiedAt: new Date('2026-01-01'),
      commissionRate: null,
      userId: 'u1',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    };

    const view = toPublicSellerView(fullSeller);

    expect(view).toEqual({
      id: 's1',
      displayName: 'Demo Shop',
      slug: 'demo-shop',
      description: 'We sell demo things',
      logoUrl: 'https://cdn.example.com/logo.png',
    });
    // Explicit leak guard: the output key set is exactly the 5 public keys.
    expect(Object.keys(view).sort()).toEqual(
      ['description', 'displayName', 'id', 'logoUrl', 'slug'].sort(),
    );
  });

  it('preserves null description and logoUrl', () => {
    const view = toPublicSellerView({
      id: 's2',
      displayName: 'No Frills',
      slug: 'no-frills',
      description: null,
      logoUrl: null,
    });
    expect(view).toEqual({
      id: 's2',
      displayName: 'No Frills',
      slug: 'no-frills',
      description: null,
      logoUrl: null,
    });
  });
});
