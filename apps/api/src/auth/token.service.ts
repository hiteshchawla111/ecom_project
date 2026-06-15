import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { AccessTokenPayload } from './auth-tokens';

interface RotateResult {
  userId: string;
  refreshToken: string;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly passwords: PasswordService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): Promise<string> {
    // Config returns a plain string; the JWT lib brands durations (e.g. "15m").
    const expiresIn = (this.config.get<string>('JWT_ACCESS_TTL') ??
      '15m') as JwtSignOptions['expiresIn'];
    return this.jwt.signAsync(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn,
    });
  }

  verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    return this.jwt.verifyAsync<AccessTokenPayload>(token, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** Issue an opaque refresh token; store only its digest. Returns the raw token. */
  async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('hex');
    const tokenHash = this.digest(raw);
    const ttlDays = this.parseDays(
      this.config.get<string>('JWT_REFRESH_TTL') ?? '7d',
    );
    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000),
      },
    });
    return raw;
  }

  /** Validate a raw refresh token, revoke it, and issue a replacement. */
  async rotateRefreshToken(raw: string): Promise<RotateResult> {
    const record = await this.findValidRefreshToken(raw);
    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    const refreshToken = await this.issueRefreshToken(record.userId);
    return { userId: record.userId, refreshToken };
  }

  async revokeRefreshToken(raw: string): Promise<void> {
    const record = await this.findValidRefreshToken(raw).catch(() => null);
    if (record) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async findValidRefreshToken(raw: string) {
    const tokenHash = this.digest(raw);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt.getTime() < Date.now()
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return record;
  }

  private digest(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private parseDays(ttl: string): number {
    const m = /^(\d+)d$/.exec(ttl);
    return m ? Number(m[1]) : 7;
  }
}
