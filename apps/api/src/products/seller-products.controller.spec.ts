import { Role } from '@prisma/client';
import { SellerProductsController } from './seller-products.controller';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ListProductsDto } from './dto/list-products.dto';

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
  const ctrl = new SellerProductsController(products as never);
  return { ctrl, products };
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
