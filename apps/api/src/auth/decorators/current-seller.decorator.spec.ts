import { ForbiddenException } from '@nestjs/common';
import { extractSellerId } from './current-seller.decorator';

describe('extractSellerId', () => {
  it('returns the sellerId attached to the request', () => {
    expect(extractSellerId({ sellerId: 's1' })).toBe('s1');
  });

  it('throws when sellerId is missing (guard not applied / wiring error)', () => {
    expect(() => extractSellerId({})).toThrow(ForbiddenException);
  });
});
