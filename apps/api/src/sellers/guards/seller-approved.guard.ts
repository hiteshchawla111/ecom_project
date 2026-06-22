import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Role, SellerStatus } from '@prisma/client';
import { AccessTokenPayload } from '../../auth/auth-tokens';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SellerApprovedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AccessTokenPayload; sellerId?: string }>();
    const { user } = request;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    // ADMIN bypasses the seller check — admins act cross-seller and need no seller row
    if (user.role === Role.ADMIN) {
      return true;
    }

    // DB-authoritative: check Seller.status, not the JWT role claim (can be up to 15 min stale)
    const seller = await this.prisma.seller.findUnique({
      where: { userId: user.sub },
      select: { id: true, status: true },
    });

    if (seller === null || seller.status !== SellerStatus.ACTIVE) {
      throw new ForbiddenException('Seller account is not active');
    }

    // Attach the resolved seller id for downstream scoping (@CurrentSeller()).
    request.sellerId = seller.id;
    return true;
  }
}
