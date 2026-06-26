import { describe, it, expect, vi } from 'vitest';
import { handleSuggest } from './handlers';

const rows = [{ id: 'p1', name: 'Aurora', price: '799.00', salePrice: null }];

describe('handleSuggest', () => {
  it('returns suggestions for a valid query', async () => {
    const suggest = vi.fn().mockResolvedValue(rows);
    const res = await handleSuggest({ q: 'aurora', limit: '8' }, { suggest });
    expect(suggest).toHaveBeenCalledWith({ q: 'aurora', limit: 8 });
    expect(res).toEqual({ status: 200, body: rows });
  });

  it('returns [] without calling suggest for a short query', async () => {
    const suggest = vi.fn();
    const res = await handleSuggest({ q: 'a' }, { suggest });
    expect(suggest).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 200, body: [] });
  });

  it('returns [] without calling suggest when q is absent', async () => {
    const suggest = vi.fn();
    const res = await handleSuggest({}, { suggest });
    expect(suggest).not.toHaveBeenCalled();
    expect(res).toEqual({ status: 200, body: [] });
  });

  it('clamps limit to 1..20 and defaults to 8', async () => {
    const suggest = vi.fn().mockResolvedValue(rows);
    await handleSuggest({ q: 'aurora', limit: '999' }, { suggest });
    expect(suggest).toHaveBeenCalledWith({ q: 'aurora', limit: 20 });
    await handleSuggest({ q: 'aurora' }, { suggest });
    expect(suggest).toHaveBeenLastCalledWith({ q: 'aurora', limit: 8 });
  });

  it('degrades to [] (200) when suggest throws', async () => {
    const suggest = vi.fn().mockRejectedValue(new Error('API down'));
    const res = await handleSuggest({ q: 'aurora' }, { suggest });
    expect(res).toEqual({ status: 200, body: [] });
  });
});
