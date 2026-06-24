import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SearchProductsDto } from './search-products.dto';

const make = (obj: Record<string, unknown>) =>
  plainToInstance(SearchProductsDto, obj, { enableImplicitConversion: false });

describe('SearchProductsDto', () => {
  it('accepts a query string and coerces numeric page/pageSize from strings', async () => {
    const dto = make({ q: 'aurora', page: '2', pageSize: '10' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(10);
  });

  it('rejects page < 1', async () => {
    const errors = await validate(make({ q: 'x', page: '0' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects pageSize > 100', async () => {
    const errors = await validate(make({ q: 'x', pageSize: '101' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows all fields omitted (blank search handled by the service)', async () => {
    const errors = await validate(make({}));
    expect(errors).toHaveLength(0);
  });
});
