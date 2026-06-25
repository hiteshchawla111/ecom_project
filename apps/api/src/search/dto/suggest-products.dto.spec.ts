import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SuggestProductsDto } from './suggest-products.dto';

const make = (obj: Record<string, unknown>) =>
  plainToInstance(SuggestProductsDto, obj, { enableImplicitConversion: false });

describe('SuggestProductsDto', () => {
  it('accepts q and coerces limit from a string', async () => {
    const dto = make({ q: 'auro', limit: '5' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.limit).toBe(5);
  });

  it('rejects limit < 1', async () => {
    const errors = await validate(make({ q: 'x', limit: '0' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects limit > 20', async () => {
    const errors = await validate(make({ q: 'x', limit: '21' }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('allows all fields omitted (blank q handled by the service)', async () => {
    const errors = await validate(make({}));
    expect(errors).toHaveLength(0);
  });
});
