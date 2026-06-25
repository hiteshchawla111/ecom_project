import { Role } from '@prisma/client';
import { SellerInventoryController } from './seller-inventory.controller';
import { ListStockDto } from './dto/list-stock.dto';
import { CreateMovementDto } from './dto/create-movement.dto';
import { MovementType } from '@prisma/client';

const SELLER_ID = 'seller-a';
const actorFor = (sellerId: string) => ({ role: Role.SELLER, sellerId });

const build = () => {
  const inventory = {
    listStock: jest.fn(),
    getStockItem: jest.fn(),
    adjust: jest.fn(),
    report: jest.fn(),
  };
  const ctrl = new SellerInventoryController(inventory as never);
  return { ctrl, inventory };
};

describe('SellerInventoryController', () => {
  it('listStock passes a seller-scoped actor', async () => {
    const { ctrl, inventory } = build();
    const query = {} as ListStockDto;
    await ctrl.listStock(SELLER_ID, query);
    expect(inventory.listStock).toHaveBeenCalledWith(
      query,
      actorFor(SELLER_ID),
    );
  });

  it('getStockItem passes a seller-scoped actor', async () => {
    const { ctrl, inventory } = build();
    await ctrl.getStockItem(SELLER_ID, 'p1');
    expect(inventory.getStockItem).toHaveBeenCalledWith(
      'p1',
      actorFor(SELLER_ID),
    );
  });

  it('report passes a seller-scoped actor', async () => {
    const { ctrl, inventory } = build();
    await ctrl.report(SELLER_ID);
    expect(inventory.report).toHaveBeenCalledWith(actorFor(SELLER_ID));
  });

  it('createMovement passes a merged actor (user sub + guard sellerId), productId, and dto', async () => {
    const { ctrl, inventory } = build();
    const user = { sub: 'u-1', email: 'a@b.c', role: Role.SELLER };
    const dto: CreateMovementDto = {
      type: MovementType.ADDITION,
      quantity: 5,
      reason: 'restock',
    };
    await ctrl.createMovement(user, SELLER_ID, 'p1', dto);
    // audit needs sub (from @CurrentUser), scope needs sellerId (from @CurrentSeller)
    expect(inventory.adjust).toHaveBeenCalledWith(
      { ...user, sellerId: SELLER_ID },
      'p1',
      dto,
    );
  });
});
