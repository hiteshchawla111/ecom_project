import { ConflictException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SellerProductsController } from './seller-products.controller';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ImportResult } from './dto/import-result.dto';

const SELLER_ID = 'seller-a';
const actorFor = (sellerId: string) => ({ role: Role.SELLER, sellerId });

const build = () => {
  const products = {
    list: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    setActive: jest.fn(),
  };
  const csvImport = { parseAndValidate: jest.fn() };
  const ctrl = new SellerProductsController(products as never, csvImport);
  return { ctrl, products, csvImport };
};

describe('SellerProductsController', () => {
  it('list passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    const query = {} as ListProductsDto;
    await ctrl.list(SELLER_ID, query);
    expect(products.list).toHaveBeenCalledWith(query, actorFor(SELLER_ID));
  });

  it('findOne passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    await ctrl.findOne(SELLER_ID, 'p1');
    expect(products.findOne).toHaveBeenCalledWith('p1', actorFor(SELLER_ID));
  });

  it('create passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    const dto = {} as CreateProductDto;
    await ctrl.create(SELLER_ID, dto);
    expect(products.create).toHaveBeenCalledWith(dto, actorFor(SELLER_ID));
  });

  it('update passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    const dto = {} as UpdateProductDto;
    await ctrl.update(SELLER_ID, 'p1', dto);
    expect(products.update).toHaveBeenCalledWith(
      'p1',
      dto,
      actorFor(SELLER_ID),
    );
  });

  it('archive passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    await ctrl.archive(SELLER_ID, 'p1');
    expect(products.archive).toHaveBeenCalledWith('p1', actorFor(SELLER_ID));
  });

  it('setActive passes a seller-scoped actor', async () => {
    const { ctrl, products } = build();
    await ctrl.setActive(SELLER_ID, 'p1', { active: false });
    expect(products.setActive).toHaveBeenCalledWith(
      'p1',
      false,
      actorFor(SELLER_ID),
    );
  });
});

describe('import', () => {
  const fileWith = (s: string) =>
    ({ buffer: Buffer.from(s) }) as Express.Multer.File;

  it('creates one product per valid row, scoped to the seller, and reports the result', async () => {
    const { ctrl, products, csvImport } = build();
    csvImport.parseAndValidate.mockReturnValue({
      valid: [
        { dto: { sku: 'A' }, row: 1 },
        { dto: { sku: 'B' }, row: 2 },
      ],
      errors: [],
    });
    products.create
      .mockResolvedValueOnce({ id: 'p1' })
      .mockResolvedValueOnce({ id: 'p2' });

    const res = await ctrl.import(SELLER_ID, fileWith('csv'));

    expect(products.create).toHaveBeenNthCalledWith(
      1,
      { sku: 'A' },
      actorFor(SELLER_ID),
    );
    expect(products.create).toHaveBeenNthCalledWith(
      2,
      { sku: 'B' },
      actorFor(SELLER_ID),
    );
    expect(res).toEqual(
      expect.objectContaining({
        created: 2,
        failed: 0,
        productIds: ['p1', 'p2'],
        errors: [],
      }),
    );
  });

  it('collects a per-row create failure (e.g. own-SKU conflict) without aborting', async () => {
    const { ctrl, products, csvImport } = build();
    csvImport.parseAndValidate.mockReturnValue({
      valid: [
        { dto: { sku: 'DUP' }, row: 1 },
        { dto: { sku: 'OK' }, row: 2 },
      ],
      errors: [{ row: 3, sku: 'BAD', message: 'name must be longer' }],
    });
    products.create
      .mockRejectedValueOnce(
        new ConflictException('A product with this SKU already exists'),
      )
      .mockResolvedValueOnce({ id: 'p2' });

    const res: ImportResult = await ctrl.import(SELLER_ID, fileWith('csv'));

    expect(res.created).toBe(1);
    expect(res.productIds).toEqual(['p2']);
    // one parse-stage error + one create-stage error
    expect(res.failed).toBe(2);
    expect(res.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 3, sku: 'BAD' }),
        expect.objectContaining({ row: 1, sku: 'DUP' }),
      ]),
    );
    const createErr = res.errors.find((e) => e.row === 1);
    expect(createErr?.message).toMatch(/SKU/i);
  });

  it('rejects when no file was uploaded', async () => {
    const { ctrl } = build();
    await expect(
      ctrl.import(SELLER_ID, undefined as never),
    ).rejects.toBeDefined();
  });
});
