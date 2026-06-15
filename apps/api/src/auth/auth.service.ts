import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RequestResetDto } from './dto/request-reset.dto';
import { ConfirmResetDto } from './dto/confirm-reset.dto';
import { TokenPair } from './auth-tokens';

/** Small helper bundle so the service is unit-testable without ConfigService. */
export interface ResetHelpers {
  digest(raw: string): string;
  resetTtlMs(): number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    @Inject('RESET_HELPERS') private readonly reset: ResetHelpers,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException('Email already registered');
    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.prisma.user.create({
      data: { email, name: dto.name, passwordHash, role: Role.CUSTOMER },
    });
    return this.issuePair(user.id, user.email, user.role);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    const generic = new UnauthorizedException('Invalid credentials');
    // TODO(phase-7): equalize timing on the unknown-email path (run a dummy
    // bcrypt compare) so latency can't be used to enumerate registered emails.
    if (!user || !user.isActive || user.deletedAt) throw generic;
    const ok = await this.passwords.compare(dto.password, user.passwordHash);
    if (!ok) throw generic;
    return this.issuePair(user.id, user.email, user.role);
  }

  async refresh(dto: RefreshDto): Promise<TokenPair> {
    const { userId, refreshToken } = await this.tokens.rotateRefreshToken(
      dto.refreshToken,
    );
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive || user.deletedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return { accessToken, refreshToken };
  }

  async logout(refreshToken: string): Promise<{ ok: true }> {
    await this.tokens.revokeRefreshToken(refreshToken);
    return { ok: true };
  }

  async requestPasswordReset(dto: RequestResetDto): Promise<{ ok: true }> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const raw = randomBytes(32).toString('hex');
      await this.prisma.passwordResetToken.create({
        data: {
          tokenHash: this.reset.digest(raw),
          userId: user.id,
          expiresAt: new Date(Date.now() + this.reset.resetTtlMs()),
        },
      });
      // Phase 6: emit a domain event here to deliver `raw` by email.
    }
    return { ok: true };
  }

  async confirmPasswordReset(dto: ConfirmResetDto): Promise<{ ok: true }> {
    const tokenHash = this.reset.digest(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Invalid or expired reset token');
    }
    // TODO(phase-7): close the TOCTOU window by atomically claiming the token
    // (UPDATE ... WHERE usedAt IS NULL RETURNING *) instead of read-then-write.
    const passwordHash = await this.passwords.hash(dto.password);
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await this.tokens.revokeAllForUser(record.userId);
    return { ok: true };
  }

  private async issuePair(
    id: string,
    email: string,
    role: Role,
  ): Promise<TokenPair> {
    const accessToken = await this.tokens.signAccessToken({
      sub: id,
      email,
      role,
    });
    const refreshToken = await this.tokens.issueRefreshToken(id);
    return { accessToken, refreshToken };
  }

  /** Default helpers used in the module wiring (uses crypto + config). */
  static resetHelpers(config: ConfigService): ResetHelpers {
    return {
      digest: (raw: string) => createHash('sha256').update(raw).digest('hex'),
      resetTtlMs: () => {
        const ttl = config.get<string>('PASSWORD_RESET_TTL') ?? '1h';
        const m = /^(\d+)h$/.exec(ttl);
        return (m ? Number(m[1]) : 1) * 60 * 60 * 1000;
      },
    };
  }
}
