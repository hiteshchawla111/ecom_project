import { BadRequestException } from '@nestjs/common';
import {
  ProductCsvImportService,
  MAX_IMPORT_ROWS,
} from './product-csv-import.service';

const svc = new ProductCsvImportService();
const buf = (s: string) => Buffer.from(s, 'utf8');

const HEADER = 'name,sku,description,price,categoryId';

describe('ProductCsvImportService.parseAndValidate', () => {
  it('parses a well-formed CSV into valid DTOs with 1-based row numbers', () => {
    const csv = `${HEADER}\nWidget,WID-1,A widget,19.99,cat1\nGadget,GAD-1,A gadget,5,cat1`;
    const { valid, errors } = svc.parseAndValidate(buf(csv));
    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(2);
    expect(valid[0].row).toBe(1);
    expect(valid[0].dto.name).toBe('Widget');
    expect(valid[0].dto.sku).toBe('WID-1');
    expect(valid[0].dto.price).toBe(19.99);
    expect(valid[0].dto.categoryId).toBe('cat1');
  });

  it('handles a quoted field containing a comma (CSV correctness)', () => {
    const csv = `${HEADER}\n"Widget, deluxe",WID-2,"Big, roomy",10,cat1`;
    const { valid, errors } = svc.parseAndValidate(buf(csv));
    expect(errors).toHaveLength(0);
    expect(valid[0].dto.name).toBe('Widget, deluxe');
    expect(valid[0].dto.description).toBe('Big, roomy');
  });

  it('reports a row missing a required field as an error (does not throw)', () => {
    const csv = `${HEADER}\n,WID-3,no name,10,cat1`; // empty name
    const { valid, errors } = svc.parseAndValidate(buf(csv));
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toEqual(
      expect.objectContaining({ row: 1, sku: 'WID-3' }),
    );
    expect(errors[0].message).toMatch(/name/i);
  });

  it('reports a non-numeric / non-positive price as an error', () => {
    const csv = `${HEADER}\nWidget,WID-4,desc,-5,cat1`;
    const { errors } = svc.parseAndValidate(buf(csv));
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/price/i);
  });

  it('throws BadRequestException when row count exceeds MAX_IMPORT_ROWS', () => {
    const rows = Array.from(
      { length: MAX_IMPORT_ROWS + 1 },
      (_, i) => `Widget${i},SKU-${i},desc,1,cat1`,
    ).join('\n');
    expect(() => svc.parseAndValidate(buf(`${HEADER}\n${rows}`))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException on a malformed / empty file (no header)', () => {
    expect(() => svc.parseAndValidate(buf(''))).toThrow(BadRequestException);
  });
});
