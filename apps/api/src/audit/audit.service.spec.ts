/* eslint-disable @typescript-eslint/no-unsafe-assignment */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
import { AuditService } from './audit.service';
import { Logger } from '@nestjs/common';

describe('AuditService', () => {
  const txCreate = jest.fn();
  const prismaCreate = jest.fn();
  const tx = { auditLog: { create: txCreate } } as any;
  const prisma = { auditLog: { create: prismaCreate } } as any;
  let service: AuditService;

  beforeEach(() => {
    txCreate.mockReset().mockResolvedValue(undefined);
    prismaCreate.mockReset().mockResolvedValue(undefined);
    service = new AuditService(prisma);
  });

  it('record writes an audit row on the provided tx client', async () => {
    await service.record(
      {
        actorId: 'u1',
        action: 'order.status.changed',
        entityType: 'Order',
        entityId: 'o1',
        metadata: { from: 'PENDING', to: 'CONFIRMED' },
      },
      tx,
    );
    expect(txCreate).toHaveBeenCalledWith({
      data: {
        actorId: 'u1',
        action: 'order.status.changed',
        entityType: 'Order',
        entityId: 'o1',
        metadata: { from: 'PENDING', to: 'CONFIRMED' },
      },
    });
    expect(prismaCreate).not.toHaveBeenCalled();
  });

  it('recordAsync writes via the base prisma client', async () => {
    await service.recordAsync({
      actorId: null,
      action: 'inventory.adjusted',
      entityType: 'InventoryItem',
      entityId: 'p1',
    });
    expect(prismaCreate).toHaveBeenCalledWith({
      data: {
        actorId: null,
        action: 'inventory.adjusted',
        entityType: 'InventoryItem',
        entityId: 'p1',
        metadata: undefined,
      },
    });
    expect(txCreate).not.toHaveBeenCalled();
  });

  it('recordAsync swallows and logs a write failure (never throws)', async () => {
    prismaCreate.mockRejectedValueOnce(new Error('db down'));
    const logSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    await expect(
      service.recordAsync({ actorId: 'u1', action: 'x', entityType: 'Y' }),
    ).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
