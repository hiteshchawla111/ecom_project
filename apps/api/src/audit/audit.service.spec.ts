import { AuditService } from './audit.service';
import { Logger } from '@nestjs/common';

describe('AuditService', () => {
  const create = jest.fn();
  const tx = { auditLog: { create } } as any;
  const prisma = { auditLog: { create } } as any;
  let service: AuditService;

  beforeEach(() => {
    create.mockReset().mockResolvedValue(undefined);
    service = new AuditService(prisma);
  });

  it('record writes an audit row on the provided tx client', async () => {
    await service.record(
      { actorId: 'u1', action: 'order.status.changed', entityType: 'Order', entityId: 'o1', metadata: { from: 'PENDING', to: 'CONFIRMED' } },
      tx,
    );
    expect(create).toHaveBeenCalledWith({
      data: { actorId: 'u1', action: 'order.status.changed', entityType: 'Order', entityId: 'o1', metadata: { from: 'PENDING', to: 'CONFIRMED' } },
    });
  });

  it('recordAsync writes via the base prisma client', async () => {
    await service.recordAsync({ actorId: null, action: 'inventory.adjusted', entityType: 'InventoryItem', entityId: 'p1' });
    expect(create).toHaveBeenCalledWith({
      data: { actorId: null, action: 'inventory.adjusted', entityType: 'InventoryItem', entityId: 'p1', metadata: undefined },
    });
  });

  it('recordAsync swallows and logs a write failure (never throws)', async () => {
    create.mockRejectedValueOnce(new Error('db down'));
    const logSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await expect(service.recordAsync({ actorId: 'u1', action: 'x', entityType: 'Y' })).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
