import { describe, expect, it, vi } from 'vitest';
import { ApiAuthError } from '@/lib/api-auth';
import {
  handleGetSellerMe,
  handleSellerRegister,
  handleSellerUpdate,
  type SellerRouteDeps,
} from './handlers';

const view = { id: 's1', displayName: 'Shop', status: 'PENDING_REVIEW' } as never;

function deps(over: Partial<SellerRouteDeps> = {}): SellerRouteDeps {
  return {
    register: vi.fn().mockResolvedValue(view),
    getMe: vi.fn().mockResolvedValue(view),
    update: vi.fn().mockResolvedValue(view),
    refreshSession: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('handleSellerRegister', () => {
  it('rejects a missing displayName with 400', async () => {
    const res = await handleSellerRegister({}, deps());
    expect(res.status).toBe(400);
  });

  it('registers then refreshes the session and returns ok', async () => {
    const order: string[] = [];
    const d = deps({
      register: vi.fn().mockImplementation(async () => { order.push('register'); return view; }),
      refreshSession: vi.fn().mockImplementation(async () => { order.push('refresh'); }),
    });
    const res = await handleSellerRegister({ displayName: 'Shop' }, d);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true });
    expect(order).toEqual(['register', 'refresh']);
  });

  it('maps a 409 conflict through', async () => {
    const d = deps({ register: vi.fn().mockRejectedValue(new ApiAuthError('You already have a seller account', 409)) });
    const res = await handleSellerRegister({ displayName: 'Shop' }, d);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ message: 'You already have a seller account' });
  });

  it('returns ok+reauth when refresh fails after a successful register', async () => {
    const d = deps({ refreshSession: vi.fn().mockRejectedValue(new Error('refresh down')) });
    const res = await handleSellerRegister({ displayName: 'Shop' }, d);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, reauth: true });
  });
});

describe('handleSellerUpdate', () => {
  it('omits empty fields before calling update', async () => {
    const update = vi.fn().mockResolvedValue(view);
    await handleSellerUpdate({ pan: 'ABCDE1234F', gstin: '' }, deps({ update }));
    expect(update).toHaveBeenCalledWith({ pan: 'ABCDE1234F' });
  });
});

describe('handleGetSellerMe', () => {
  it('returns the masked view', async () => {
    const res = await handleGetSellerMe(deps());
    expect(res.status).toBe(200);
    expect(res.body).toEqual(view);
  });
});
