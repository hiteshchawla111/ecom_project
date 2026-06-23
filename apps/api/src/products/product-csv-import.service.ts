import { BadRequestException, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { parse } from 'csv-parse/sync';
import { CreateProductDto } from './dto/create-product.dto';
import { RowError } from './dto/import-result.dto';

/** Hard caps to bound import cost / abuse (design spec §CSV import risk). */
export const MAX_IMPORT_ROWS = 500;
export const MAX_IMPORT_BYTES = 1_048_576; // 1 MiB

interface ValidRow {
  dto: CreateProductDto;
  row: number;
}

@Injectable()
export class ProductCsvImportService {
  /**
   * Parses a CSV buffer (header row → keyed records) and validates each data
   * row against CreateProductDto. Returns valid DTOs (with 1-based row numbers
   * for reporting) and per-row errors. Throws BadRequestException for
   * structural failures (unparseable, no header, or over the row cap) — a
   * whole-file problem, not a per-row one.
   */
  parseAndValidate(buffer: Buffer): { valid: ValidRow[]; errors: RowError[] } {
    let records: Record<string, string>[];
    try {
      records = parse(buffer, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        bom: true,
      });
    } catch {
      throw new BadRequestException('CSV could not be parsed');
    }

    if (records.length === 0) {
      throw new BadRequestException('CSV has no data rows');
    }
    if (records.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(
        `CSV exceeds the maximum of ${MAX_IMPORT_ROWS} rows`,
      );
    }

    const valid: ValidRow[] = [];
    const errors: RowError[] = [];

    records.forEach((record, index) => {
      const row = index + 1; // 1-based, header excluded
      const sku = typeof record.sku === 'string' ? record.sku : undefined;

      // Coerce numeric columns from CSV strings; leave others as-is for validation.
      const dto = plainToInstance(CreateProductDto, {
        name: record.name,
        sku: record.sku,
        description: record.description,
        price: record.price === undefined ? undefined : Number(record.price),
        salePrice:
          record.salePrice === undefined || record.salePrice === ''
            ? undefined
            : Number(record.salePrice),
        brand: record.brand === '' ? undefined : record.brand,
        categoryId: record.categoryId,
        status: record.status === '' ? undefined : record.status,
      });

      const violations = validateSync(dto, {
        whitelist: true,
        forbidNonWhitelisted: false,
      });
      if (violations.length > 0) {
        const message = violations
          .map((v) => Object.values(v.constraints ?? {}).join('; '))
          .join('; ');
        errors.push({ row, sku, message });
        return;
      }
      valid.push({ dto, row });
    });

    return { valid, errors };
  }
}
