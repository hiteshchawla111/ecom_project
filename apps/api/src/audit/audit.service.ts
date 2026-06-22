import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Write an audit row on the caller's transaction client (atomic with the mutation). */
  async record(entry: AuditEntry, tx: Prisma.TransactionClient): Promise<void> {
    await tx.auditLog.create({ data: this.toData(entry) });
  }

  /** Fire-and-forget audit write; failures are logged, never thrown. */
  async recordAsync(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.toData(entry) });
    } catch (err) {
      this.logger.error(`Audit write failed for ${entry.action}`, err as Error);
    }
  }

  private toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
    return {
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
    };
  }
}
