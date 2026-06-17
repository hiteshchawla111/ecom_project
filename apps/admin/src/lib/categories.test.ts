import { describe, it, expect, beforeEach, vi } from 'vitest';
import { apiClient } from './apiClient';
import { flattenCategories, listCategories, type Category } from './categories';

const requestMock = vi.spyOn(apiClient, 'request');
// Default to a no-op resolve so the spy never calls through to real fetch.
beforeEach(() => requestMock.mockReset().mockResolvedValue([]));

describe('listCategories', () => {
  it('GETs /categories', async () => {
    requestMock.mockResolvedValue([]);
    await listCategories();
    expect(requestMock.mock.calls[0][0]).toBe('/categories');
  });
});

describe('flattenCategories', () => {
  const tree: Category[] = [
    {
      id: 'c1',
      name: 'Electronics',
      slug: 'electronics',
      parentId: null,
      children: [
        { id: 'c2', name: 'Phones', slug: 'phones', parentId: 'c1', children: [] },
      ],
    },
  ];

  it('flattens the tree depth-first with indentation by depth', () => {
    const opts = flattenCategories(tree);
    expect(opts.map((o) => o.id)).toEqual(['c1', 'c2']);
    expect(opts[0].label).toBe('Electronics');
    expect(opts[1].label).toContain('Phones');
    // Child is indented relative to its parent.
    expect(opts[1].label.length).toBeGreaterThan('Phones'.length);
  });
});
