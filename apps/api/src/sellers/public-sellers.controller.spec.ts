/**
 * Unit tests for PublicSellersController.
 *
 * Covers:
 *  1. getBySlug delegates to sellers.getPublicBySlug and returns its result.
 *  2. listProducts resolves slug → sellerId via getActiveSellerIdBySlug first.
 *  3. listProducts always forces status=ACTIVE server-side regardless of query.
 *  4. listProducts passes the resolved sellerId in the filter arg to products.list.
 *  5. listProducts propagates a NotFoundException from getActiveSellerIdBySlug (404).
 *
 * These unit tests cover the "only ACTIVE products listed" assertion that
 * the e2e harness keeps focused on 200/404 + field-shape security assertions.
 */

import { NotFoundException } from '@nestjs/common';
import { ProductStatus, Role } from '@prisma/client';
import { PublicSellersController } from './public-sellers.controller';
import { SellersService } from './sellers.service';
import { ProductsService } from '../products/products.service';
import type { ListProductsDto } from '../products/dto/list-products.dto';
import type { PublicSellerView } from './public-seller-view';

describe('PublicSellersController', () => {
  let controller: PublicSellersController;
  let sellersMock: jest.Mocked<
    Pick<SellersService, 'getPublicBySlug' | 'getActiveSellerIdBySlug'>
  >;
  let productsMock: jest.Mocked<Pick<ProductsService, 'list'>>;

  const SLUG = 'test-seller';
  const SELLER_ID = 'seller-id-1';

  const publicView: PublicSellerView = {
    id: SELLER_ID,
    displayName: 'Test Seller Shop',
    slug: SLUG,
    description: 'A test shop',
    logoUrl: null,
  };

  const paginatedProducts = {
    data: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  };

  beforeEach(() => {
    sellersMock = {
      getPublicBySlug: jest.fn(),
      getActiveSellerIdBySlug: jest.fn(),
    };

    productsMock = {
      list: jest.fn(),
    };

    controller = new PublicSellersController(
      sellersMock as never,
      productsMock as never,
    );
  });

  // ---------------------------------------------------------------------------
  // getBySlug
  // ---------------------------------------------------------------------------
  describe('getBySlug', () => {
    it('delegates to sellers.getPublicBySlug(slug) and returns its result', async () => {
      sellersMock.getPublicBySlug.mockResolvedValueOnce(publicView);

      const result = await controller.getBySlug(SLUG);

      expect(sellersMock.getPublicBySlug).toHaveBeenCalledTimes(1);
      expect(sellersMock.getPublicBySlug).toHaveBeenCalledWith(SLUG);
      expect(result).toBe(publicView);
    });

    it('propagates NotFoundException from getPublicBySlug (non-ACTIVE seller → 404)', async () => {
      sellersMock.getPublicBySlug.mockRejectedValueOnce(
        new NotFoundException('Seller not found'),
      );

      await expect(controller.getBySlug('inactive-seller')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // listProducts
  // ---------------------------------------------------------------------------
  describe('listProducts', () => {
    it('resolves slug → sellerId via getActiveSellerIdBySlug before listing', async () => {
      sellersMock.getActiveSellerIdBySlug.mockResolvedValueOnce(SELLER_ID);
      productsMock.list.mockResolvedValueOnce(paginatedProducts);

      const query: ListProductsDto = { page: 1, pageSize: 10 };
      await controller.listProducts(SLUG, query);

      expect(sellersMock.getActiveSellerIdBySlug).toHaveBeenCalledWith(SLUG);
    });

    it('forces status=ACTIVE regardless of what query.status is set to', async () => {
      sellersMock.getActiveSellerIdBySlug.mockResolvedValueOnce(SELLER_ID);
      productsMock.list.mockResolvedValueOnce(paginatedProducts);

      // Caller tries to request INACTIVE products — must be overridden.
      const query: ListProductsDto = {
        status: ProductStatus.INACTIVE,
      };
      await controller.listProducts(SLUG, query);

      const [passedQuery] = productsMock.list.mock.calls[0];
      expect(passedQuery.status).toBe(ProductStatus.ACTIVE);
    });

    it('passes the resolved sellerId in the filter argument to products.list', async () => {
      sellersMock.getActiveSellerIdBySlug.mockResolvedValueOnce(SELLER_ID);
      productsMock.list.mockResolvedValueOnce(paginatedProducts);

      const query: ListProductsDto = {};
      await controller.listProducts(SLUG, query);

      const [, , filter] = productsMock.list.mock.calls[0];
      expect(filter).toEqual({ sellerId: SELLER_ID });
    });

    it('passes PUBLIC_READ_ACTOR (role:ADMIN) as the actor', async () => {
      sellersMock.getActiveSellerIdBySlug.mockResolvedValueOnce(SELLER_ID);
      productsMock.list.mockResolvedValueOnce(paginatedProducts);

      await controller.listProducts(SLUG, {});

      const [, actor] = productsMock.list.mock.calls[0];
      expect(actor).toEqual({ role: Role.ADMIN });
    });

    it('propagates NotFoundException from getActiveSellerIdBySlug (404 before listing)', async () => {
      sellersMock.getActiveSellerIdBySlug.mockRejectedValueOnce(
        new NotFoundException('Seller not found'),
      );

      await expect(
        controller.listProducts('nonexistent-slug', {}),
      ).rejects.toThrow(NotFoundException);

      // products.list must NOT be called when seller isn't found.
      expect(productsMock.list).not.toHaveBeenCalled();
    });
  });
});
