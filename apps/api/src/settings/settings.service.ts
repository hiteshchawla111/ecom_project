import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BRANDING_UPDATED } from '../audit/audit-actions';

/** AppSetting key for the brand hue. */
export const BRAND_HUE_KEY = 'brand.hue';
/** Default coral hue (matches DESIGN.md primary-500) when none is stored. */
export const DEFAULT_BRAND_HUE = 28;

export interface Branding {
  hue: number;
}

/**
 * Global app settings. Currently just the brand hue (0–360) both frontends
 * resolve their primary color from. Reads are cheap and public; writes are
 * admin-only and audited (atomic with the upsert in one transaction).
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getBranding(): Promise<Branding> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: BRAND_HUE_KEY },
    });
    const parsed = row ? Number(row.value) : NaN;
    return { hue: Number.isFinite(parsed) ? parsed : DEFAULT_BRAND_HUE };
  }

  async setBranding(hue: number, actorId: string): Promise<Branding> {
    const value = String(hue);
    await this.prisma.$transaction(async (tx) => {
      await tx.appSetting.upsert({
        where: { key: BRAND_HUE_KEY },
        create: { key: BRAND_HUE_KEY, value },
        update: { value },
      });
      await this.audit.record(
        {
          actorId,
          action: BRANDING_UPDATED,
          entityType: 'AppSetting',
          entityId: BRAND_HUE_KEY,
          metadata: { hue },
        },
        tx,
      );
    });
    return { hue };
  }
}
