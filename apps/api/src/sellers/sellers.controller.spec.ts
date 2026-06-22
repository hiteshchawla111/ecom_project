import { Role } from '@prisma/client';
import { SellersController } from './sellers.controller';
import { SellersService } from './sellers.service';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import type { RegisterSellerDto } from './dto/register-seller.dto';
import type { UpdateSellerDto } from './dto/update-seller.dto';

describe('SellersController', () => {
  let controller: SellersController;
  let serviceMock: jest.Mocked<
    Pick<SellersService, 'register' | 'getMe' | 'updateMe'>
  >;

  const user: AccessTokenPayload = {
    sub: 'u1',
    email: 'a@b.c',
    role: Role.SELLER,
  };

  beforeEach(() => {
    serviceMock = {
      register: jest.fn(),
      getMe: jest.fn(),
      updateMe: jest.fn(),
    };

    controller = new SellersController(serviceMock as never);
  });

  describe('register', () => {
    it('delegates to sellers.register with (user, dto) and returns its result', async () => {
      const dto = { displayName: 'My Shop' } as RegisterSellerDto;
      const expected = { id: 's1', displayName: 'My Shop' };
      serviceMock.register.mockResolvedValueOnce(expected as never);

      const result = await controller.register(user, dto);

      expect(serviceMock.register).toHaveBeenCalledTimes(1);
      expect(serviceMock.register).toHaveBeenCalledWith(user, dto);
      expect(result).toBe(expected);
    });
  });

  describe('getMe', () => {
    it('delegates to sellers.getMe with (user) and returns its result', async () => {
      const expected = { id: 's1', displayName: 'My Shop' };
      serviceMock.getMe.mockResolvedValueOnce(expected as never);

      const result = await controller.getMe(user);

      expect(serviceMock.getMe).toHaveBeenCalledTimes(1);
      expect(serviceMock.getMe).toHaveBeenCalledWith(user);
      expect(result).toBe(expected);
    });
  });

  describe('updateMe', () => {
    it('delegates to sellers.updateMe with (user, dto) and returns its result', async () => {
      const dto = { displayName: 'Updated Shop' } as UpdateSellerDto;
      const expected = { id: 's1', displayName: 'Updated Shop' };
      serviceMock.updateMe.mockResolvedValueOnce(expected as never);

      const result = await controller.updateMe(user, dto);

      expect(serviceMock.updateMe).toHaveBeenCalledTimes(1);
      expect(serviceMock.updateMe).toHaveBeenCalledWith(user, dto);
      expect(result).toBe(expected);
    });
  });
});
