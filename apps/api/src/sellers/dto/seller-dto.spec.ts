import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { RegisterSellerDto } from './register-seller.dto';
import { UpdateSellerDto } from './update-seller.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getErrors(
  dto: RegisterSellerDto | UpdateSellerDto,
): Promise<string[]> {
  const result = await validate(dto);
  return result.map((e) => e.property);
}

// ---------------------------------------------------------------------------
// RegisterSellerDto
// ---------------------------------------------------------------------------

describe('RegisterSellerDto', () => {
  it('passes with a valid displayName and KYC fields', async () => {
    const dto = plainToInstance(RegisterSellerDto, {
      displayName: 'Acme Sellers',
      gstin: '29ABCDE1234F1Z5',
      pan: 'ABCDE1234F',
      bankAccountNo: '123456789',
      bankIfsc: 'SBIN0001234',
    });
    const errors = await getErrors(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes without optional fields', async () => {
    const dto = plainToInstance(RegisterSellerDto, {
      displayName: 'My Shop',
    });
    const errors = await getErrors(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when displayName is too short (< 2 chars)', async () => {
    const dto = plainToInstance(RegisterSellerDto, {
      displayName: 'A',
    });
    const errors = await getErrors(dto);
    expect(errors).toContain('displayName');
  });

  it('fails when displayName is missing', async () => {
    const dto = plainToInstance(RegisterSellerDto, {});
    const errors = await getErrors(dto);
    expect(errors).toContain('displayName');
  });

  it('fails when pan has an invalid format', async () => {
    const dto = plainToInstance(RegisterSellerDto, {
      displayName: 'My Shop',
      pan: 'xyz',
    });
    const errors = await getErrors(dto);
    expect(errors).toContain('pan');
  });

  it('fails when gstin has an invalid format', async () => {
    const dto = plainToInstance(RegisterSellerDto, {
      displayName: 'My Shop',
      gstin: 'INVALID',
    });
    const errors = await getErrors(dto);
    expect(errors).toContain('gstin');
  });

  it('fails when bankAccountNo has an invalid format (too short)', async () => {
    const dto = plainToInstance(RegisterSellerDto, {
      displayName: 'My Shop',
      bankAccountNo: '12345', // < 9 digits
    });
    const errors = await getErrors(dto);
    expect(errors).toContain('bankAccountNo');
  });

  it('fails when bankIfsc has an invalid format', async () => {
    const dto = plainToInstance(RegisterSellerDto, {
      displayName: 'My Shop',
      bankIfsc: 'BADIFSC',
    });
    const errors = await getErrors(dto);
    expect(errors).toContain('bankIfsc');
  });

  /**
   * The global ValidationPipe (whitelist:true + forbidNonWhitelisted:true)
   * strips and rejects undeclared fields at runtime. In a unit test we can
   * verify the DTO class simply does not declare `status`, `slug`, or `role`
   * as own properties — confirming they will always be stripped/rejected by
   * the pipe.
   */
  it('does not declare status, slug, or role properties', () => {
    const instance = new RegisterSellerDto();
    expect(Object.prototype.hasOwnProperty.call(instance, 'status')).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(instance, 'slug')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(instance, 'role')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(instance, 'userId')).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// UpdateSellerDto
// ---------------------------------------------------------------------------

describe('UpdateSellerDto', () => {
  it('passes with no fields (full-optional)', async () => {
    const dto = plainToInstance(UpdateSellerDto, {});
    const errors = await getErrors(dto);
    expect(errors).toHaveLength(0);
  });

  it('passes with a valid partial update', async () => {
    const dto = plainToInstance(UpdateSellerDto, {
      displayName: 'Updated Name',
      pan: 'ABCDE1234F',
    });
    const errors = await getErrors(dto);
    expect(errors).toHaveLength(0);
  });

  it('fails when displayName is too short', async () => {
    const dto = plainToInstance(UpdateSellerDto, {
      displayName: 'X',
    });
    const errors = await getErrors(dto);
    expect(errors).toContain('displayName');
  });

  it('allows description: null (explicit clear)', async () => {
    const dto = plainToInstance(UpdateSellerDto, {
      description: null,
    });
    const errors = await getErrors(dto);
    expect(errors).not.toContain('description');
  });

  it('allows logoUrl: null (explicit clear)', async () => {
    const dto = plainToInstance(UpdateSellerDto, {
      logoUrl: null,
    });
    const errors = await getErrors(dto);
    expect(errors).not.toContain('logoUrl');
  });

  it('fails when description exceeds MaxLength', async () => {
    const dto = plainToInstance(UpdateSellerDto, {
      description: 'a'.repeat(2001),
    });
    const errors = await getErrors(dto);
    expect(errors).toContain('description');
  });

  it('fails when pan is malformed', async () => {
    const dto = plainToInstance(UpdateSellerDto, {
      pan: 'badpan',
    });
    const errors = await getErrors(dto);
    expect(errors).toContain('pan');
  });

  it('does not declare status, slug, or role properties', () => {
    const instance = new UpdateSellerDto();
    expect(Object.prototype.hasOwnProperty.call(instance, 'status')).toBe(
      false,
    );
    expect(Object.prototype.hasOwnProperty.call(instance, 'slug')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(instance, 'role')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(instance, 'userId')).toBe(
      false,
    );
  });
});
