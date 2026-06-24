import { SearchController } from './search.controller';
import type { ProductSearch } from './product-search';

const makeSearch = () => {
  const searchFn = jest.fn().mockResolvedValue({
    data: [],
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  // Cast to ProductSearch so the controller constructor receives the correct type.
  // searchFn retains its jest.Mock identity for assertion.
  return { searchFn, stub: { search: searchFn } as unknown as ProductSearch };
};

describe('SearchController', () => {
  it('delegates to ProductSearch.search with DTO values', async () => {
    const { searchFn, stub } = makeSearch();
    const ctrl = new SearchController(stub);
    await ctrl.search({ q: 'aurora', page: 2, pageSize: 10 });
    expect(searchFn).toHaveBeenCalledWith('aurora', 2, 10);
  });

  it('applies defaults when page/pageSize/q are omitted', async () => {
    const { searchFn, stub } = makeSearch();
    const ctrl = new SearchController(stub);
    await ctrl.search({});
    expect(searchFn).toHaveBeenCalledWith('', 1, 20);
  });

  describe('suggest', () => {
    const makeSuggest = () => {
      const suggestFn = jest.fn().mockResolvedValue([]);
      // Cast to ProductSearch so the controller constructor receives the correct type.
      return {
        suggestFn,
        stub: { suggest: suggestFn } as unknown as ProductSearch,
      };
    };

    it('delegates to ProductSearch.suggest with DTO values', async () => {
      const { suggestFn, stub } = makeSuggest();
      const ctrl = new SearchController(stub);
      await ctrl.suggest({ q: 'auro', limit: 5 });
      expect(suggestFn).toHaveBeenCalledWith('auro', 5);
    });

    it('applies defaults when q/limit are omitted', async () => {
      const { suggestFn, stub } = makeSuggest();
      const ctrl = new SearchController(stub);
      await ctrl.suggest({});
      expect(suggestFn).toHaveBeenCalledWith('', 8);
    });
  });
});
