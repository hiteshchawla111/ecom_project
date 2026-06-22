import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AccessTokenPayload } from '../auth/auth-tokens';
import { SellersService } from './sellers.service';
import { RegisterSellerDto } from './dto/register-seller.dto';
import { UpdateSellerDto } from './dto/update-seller.dto';

/**
 * Seller self-service endpoints.
 *
 * No class-level @Roles() — register must be reachable by any authenticated
 * non-seller user. The global JwtAuthGuard already requires a valid token on
 * every route; RolesGuard is applied per-route where needed.
 */
@Controller('seller')
export class SellersController {
  constructor(private readonly sellers: SellersService) {}

  /**
   * POST /seller/register
   *
   * Registers the authenticated caller as a seller. Throttled to match the
   * auth-route limit (brute-force / abuse surface). Any logged-in user may
   * hit this — no @Roles() restriction.
   */
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  register(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: RegisterSellerDto,
  ) {
    return this.sellers.register(user, dto);
  }

  /**
   * GET /seller/me
   *
   * Returns the caller's own masked seller profile.
   * Restricted to SELLER role — callers who have not yet registered as a
   * seller will receive a 403 before this handler runs.
   */
  @Get('me')
  @Roles(Role.SELLER)
  getMe(@CurrentUser() user: AccessTokenPayload) {
    return this.sellers.getMe(user);
  }

  /**
   * PATCH /seller/me
   *
   * Updates the caller's own seller profile.
   * Restricted to SELLER role.
   */
  @Patch('me')
  @Roles(Role.SELLER)
  updateMe(
    @CurrentUser() user: AccessTokenPayload,
    @Body() dto: UpdateSellerDto,
  ) {
    return this.sellers.updateMe(user, dto);
  }
}
