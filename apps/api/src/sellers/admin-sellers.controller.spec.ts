import { Role, SellerStatus } from '@prisma/client';
import { AdminSellersController } from './admin-sellers.controller';
import { SellersService } from './sellers.service';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import type { ListSellersDto } from './dto/list-sellers.dto';
import type { UpdateSellerStatusDto } from './dto/update-seller-status.dto';

describe('AdminSellersController', () => {
  let controller: AdminSellersController;
  let serviceMock: jest.Mocked<
    Pick<SellersService, 'listSellers' | 'getSeller' | 'updateStatus'>
  >;

  const admin: AccessTokenPayload = {
    sub: 'admin-1',
    email: 'admin@example.com',
    role: Role.ADMIN,
  };

  beforeEach(() => {
    serviceMock = {
      listSellers: jest.fn(),
      getSeller: jest.fn(),
      updateStatus: jest.fn(),
    };

    controller = new AdminSellersController(serviceMock as never);
  });

  describe('list', () => {
    it('delegates to sellers.listSellers with the query dto and returns its result', async () => {
      const query: ListSellersDto = {
        page: 2,
        pageSize: 10,
        status: SellerStatus.PENDING_REVIEW,
      };
      const expected = {
        data: [],
        page: 2,
        pageSize: 10,
        total: 0,
        totalPages: 1,
      };
      serviceMock.listSellers.mockResolvedValueOnce(expected);

      const result = await controller.list(query);

      expect(serviceMock.listSellers).toHaveBeenCalledTimes(1);
      expect(serviceMock.listSellers).toHaveBeenCalledWith(query);
      expect(result).toBe(expected);
    });
  });

  describe('getOne', () => {
    it('delegates to sellers.getSeller with the id and returns its result', async () => {
      const expected = { id: 's1', displayName: 'Shop One' };
      serviceMock.getSeller.mockResolvedValueOnce(expected as never);

      const result = await controller.getOne('s1');

      expect(serviceMock.getSeller).toHaveBeenCalledTimes(1);
      expect(serviceMock.getSeller).toHaveBeenCalledWith('s1');
      expect(result).toBe(expected);
    });
  });

  describe('updateStatus', () => {
    it('delegates to sellers.updateStatus with (id, dto, user) and returns its result', async () => {
      const dto: UpdateSellerStatusDto = {
        status: SellerStatus.ACTIVE,
        reason: 'KYC verified',
      };
      const expected = { id: 's1', status: SellerStatus.ACTIVE };
      serviceMock.updateStatus.mockResolvedValueOnce(expected as never);

      const result = await controller.updateStatus('s1', dto, admin);

      expect(serviceMock.updateStatus).toHaveBeenCalledTimes(1);
      expect(serviceMock.updateStatus).toHaveBeenCalledWith('s1', dto, admin);
      expect(result).toBe(expected);
    });
  });
});
