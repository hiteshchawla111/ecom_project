# M2 Seller System — Slice 4: Seller CSV Bulk Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an ACTIVE seller bulk-create products by uploading a CSV file to `POST /seller/products/import` — multipart upload with a file-size cap and row-count cap, each row validated against the same rules as single create, returning a per-row result report (created vs rejected-with-reason; partial success, not all-or-nothing), every created product owned by the acting seller.

**Architecture:** New `POST /seller/products/import` on the existing `SellerProductsController` (already seller-gated by `@Roles(SELLER)` + `SellerApprovedGuard`). `FileInterceptor('file')` (multer, via `@nestjs/platform-express` — already a dep) enforces the byte cap. A new `ProductCsvImportService` parses the buffer with `csv-parse/sync` (a new, mature dependency — handles quoting/embedded commas/newlines correctly), enforces the row cap, validates each row against `CreateProductDto` via `class-validator`, and for each valid row calls the existing `ProductsService.create(dto, actor)` (which forces seller ownership + maps per-seller dup-SKU to a conflict). Failures are collected per-row, not thrown — the response is a structured report.

**Tech Stack:** NestJS + TypeScript (strict), `@nestjs/platform-express` (multer — present), `csv-parse` (NEW dep — requires user confirmation per RULE.md §3), `class-validator`/`class-transformer` (present), Jest.

## Global Constraints

- Seller-only surface: the route lives on `SellerProductsController` (`@Roles(SELLER)` + `@UseGuards(SellerApprovedGuard)`); every created product is owned by `@CurrentSeller()`'s seller — never trust a `sellerId` in the file.
- Reuse, don't reinvent: per-row validation uses the existing `CreateProductDto` + `class-validator`; row creation uses the existing `ProductsService.create(dto, actor)` (slice 2/3) — do NOT duplicate create/ownership/dup-SKU logic.
- Abuse guardrails (design spec §CSV import risk): a **file-size limit** (multer `limits.fileSize`) and a **max row count** — both reject oversized input before/early in processing. Pick conservative caps; make them named constants.
- Partial success with a per-row report (design spec §Slice 4): `{ created: N, failed: M, errors: [{ row, sku?, message }] }` plus the created products (or their ids). One bad row must NOT abort the whole import.
- Per-seller SKU uniqueness (slice 1): a row whose SKU the seller already owns → that row fails with a conflict reason; other rows still import. Two different sellers may share a SKU.
- Strict TypeScript, no `any`. Verify with `npx tsc -p tsconfig.build.json --noEmit` (0 errors) + real boot — NOT `npm run build` exit code (it swallows tsc errors; memory: api-nest-build-swallows-tsc-errors).
- No dependency install without explicit user confirmation (RULE.md §3) — Task 1 Step 0 gates the `csv-parse` install on the user.
- No `git push` without explicit permission (RULE.md §3). Branch: `feat/seller-system` (in place).

## File Structure

- `apps/api/package.json` (modify) — add `csv-parse` dependency (after user confirmation).
- `apps/api/src/products/product-csv-import.service.ts` (new) — `parseAndValidate(buffer): { valid: CreateProductDto[]; errors: RowError[] }` (pure-ish: parse + per-row validate; no DB). Exposes `MAX_IMPORT_ROWS`.
- `apps/api/src/products/product-csv-import.service.spec.ts` (new) — unit tests: well-formed CSV → valid rows; quoted field with embedded comma; missing required column → row error; too many rows → rejected; bad numeric price → row error.
- `apps/api/src/products/dto/import-result.dto.ts` (new) — the response shape (`ImportResult`, `RowError`) as plain interfaces/types.
- `apps/api/src/products/seller-products.controller.ts` (modify) — add `POST /import` with `FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } })`, `@UploadedFile()`, `@CurrentSeller()`; orchestrate parse → per-row `ProductsService.create` → report.
- `apps/api/src/products/seller-products.controller.spec.ts` (modify) — add import-handler tests (parses, creates per valid row scoped to seller, returns report, collects per-row create failures).
- `apps/api/src/products/products.module.ts` (modify) — provide `ProductCsvImportService`.
- `apps/api/test/seller-products.e2e-spec.ts` (modify) — add an e2e: upload a small CSV (2 valid + 1 invalid row) → 2 created (owned by the seller), 1 error; oversized/too-many-rows rejected.

## Decisions locked in brainstorming

- **Input:** multipart/form-data file upload (`FileInterceptor('file')`), matching the PRD's "CSV upload" and the slice-6 admin file-picker.
- **Parser:** `csv-parse` (new mature dep) — not a hand-rolled split (quoting/embedded-comma correctness). Install gated on user confirmation (RULE.md §3).
- **Semantics:** partial success + per-row report (spec); reuse `CreateProductDto` validation + `ProductsService.create` (ownership + dup-SKU).

---

### Task 1: `csv-parse` dependency + ProductCsvImportService (parse + per-row validate)

**Files:**
- Modify: `apps/api/package.json`
- Create: `apps/api/src/products/product-csv-import.service.ts`
- Create: `apps/api/src/products/product-csv-import.service.spec.ts`
- Create: `apps/api/src/products/dto/import-result.dto.ts`

**Interfaces:**
- Produces:
  - `interface RowError { row: number; sku?: string; message: string }`
  - `interface ImportResult { created: number; failed: number; productIds: string[]; errors: RowError[] }`
  - `MAX_IMPORT_ROWS = 500` (constant), `MAX_IMPORT_BYTES = 1_048_576` (1 MiB, exported for the multer limit in Task 2).
  - `class ProductCsvImportService { parseAndValidate(buffer: Buffer): { valid: { dto: CreateProductDto; row: number }[]; errors: RowError[] } }` — parses CSV (header row → keyed objects), enforces `MAX_IMPORT_ROWS` (throws `BadRequestException` if exceeded), validates each row against `CreateProductDto`, returns valid DTOs (with their 1-based row numbers for reporting) and per-row errors. No DB access.

- [ ] **Step 0: Confirm + install the `csv-parse` dependency (RULE.md §3 — needs user OK)**

This task adds a new dependency. The controller orchestrating this plan must have obtained user confirmation before this step (the plan's owner gates it). Install:

Run: `cd apps/api && npm install csv-parse`
Expected: `csv-parse` added to `dependencies` in `apps/api/package.json`; `package-lock.json` updated. (`csv-parse` ships its own types — no `@types` needed.)
If the install is not yet approved, STOP and report NEEDS_CONTEXT — do not hand-roll a parser.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/products/product-csv-import.service.spec.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { ProductCsvImportService, MAX_IMPORT_ROWS } from './product-csv-import.service';

const svc = new ProductCsvImportService();
const buf = (s: string) => Buffer.from(s, 'utf8');

const HEADER = 'name,sku,description,price,categoryId';

describe('ProductCsvImportService.parseAndValidate', () => {
  it('parses a well-formed CSV into valid DTOs with 1-based row numbers', () => {
    const csv = `${HEADER}\nWidget,WID-1,A widget,19.99,cat1\nGadget,GAD-1,A gadget,5,cat1`;
    const { valid, errors } = svc.parseAndValidate(buf(csv));
    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(2);
    expect(valid[0]).toEqual({
      dto: expect.objectContaining({ name: 'Widget', sku: 'WID-1', price: 19.99, categoryId: 'cat1' }),
      row: 1,
    });
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
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) =>
      `Widget${i},SKU-${i},desc,1,cat1`,
    ).join('\n');
    expect(() => svc.parseAndValidate(buf(`${HEADER}\n${rows}`))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException on a malformed / empty file (no header)', () => {
    expect(() => svc.parseAndValidate(buf(''))).toThrow(BadRequestException);
  });
});
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `cd apps/api && npm test -- product-csv-import`
Expected: FAIL — `Cannot find module './product-csv-import.service'`.

- [ ] **Step 3: Create the result DTO/types**

Create `apps/api/src/products/dto/import-result.dto.ts`:

```ts
/** One failed row in a bulk import, with a human-readable reason. */
export interface RowError {
  /** 1-based data row number (excludes the header row). */
  row: number;
  /** The row's SKU if it was parseable (helps the seller locate it). */
  sku?: string;
  message: string;
}

/** Result of a bulk product import: partial success + per-row errors. */
export interface ImportResult {
  created: number;
  failed: number;
  productIds: string[];
  errors: RowError[];
}
```

- [ ] **Step 4: Implement the service**

Create `apps/api/src/products/product-csv-import.service.ts`:

```ts
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
      }) as Record<string, string>[];
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
```

- [ ] **Step 5: Run the tests — verify they pass**

Run: `cd apps/api && npm test -- product-csv-import`
Expected: PASS (6 tests). If `csv-parse/sync` import fails, confirm Step 0's install ran.

- [ ] **Step 6: tsc + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm run lint`
Expected: 0 tsc errors; lint clean.

- [ ] **Step 7: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/products/product-csv-import.service.ts apps/api/src/products/product-csv-import.service.spec.ts apps/api/src/products/dto/import-result.dto.ts
git commit -m "feat(m2): ProductCsvImportService — parse + per-row validate (csv-parse)"
```

---

### Task 2: `POST /seller/products/import` endpoint (multipart upload → per-row create → report)

**Files:**
- Modify: `apps/api/src/products/seller-products.controller.ts`
- Modify: `apps/api/src/products/seller-products.controller.spec.ts`
- Modify: `apps/api/src/products/products.module.ts`

**Interfaces:**
- Consumes: `ProductCsvImportService.parseAndValidate`, `MAX_IMPORT_BYTES` (Task 1); `ProductsService.create(dto, actor)` (slice 2/3); `@CurrentSeller()`; `ImportResult` (Task 1).
- Produces: `POST /seller/products/import` (multipart `file` field) → `ImportResult`. Each valid row created via `ProductsService.create` with `{ role: SELLER, sellerId }`; per-row create failures (e.g. own-SKU conflict) collected into `errors`, never aborting the batch.

- [ ] **Step 1: Add the controller import-handler test**

In `apps/api/src/products/seller-products.controller.spec.ts`, extend the existing mock `products` with the import service. Add tests. Because the handler loops over `create`, mock it to resolve for valid rows and reject (ConflictException) for a chosen SKU to prove per-row error collection:

```ts
import { ConflictException } from '@nestjs/common';
// ...existing imports...

// In build(): add a csvImport mock and pass it as the 2nd ctor arg.
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
  const ctrl = new SellerProductsController(products as never, csvImport as never);
  return { ctrl, products, csvImport };
};

describe('import', () => {
  const fileWith = (s: string) => ({ buffer: Buffer.from(s) }) as Express.Multer.File;

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

    expect(products.create).toHaveBeenNthCalledWith(1, { sku: 'A' }, actorFor(SELLER_ID));
    expect(products.create).toHaveBeenNthCalledWith(2, { sku: 'B' }, actorFor(SELLER_ID));
    expect(res).toEqual(
      expect.objectContaining({ created: 2, failed: 0, productIds: ['p1', 'p2'], errors: [] }),
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
      .mockRejectedValueOnce(new ConflictException('A product with this SKU already exists'))
      .mockResolvedValueOnce({ id: 'p2' });

    const res = await ctrl.import(SELLER_ID, fileWith('csv'));

    expect(res.created).toBe(1);
    expect(res.productIds).toEqual(['p2']);
    // one parse-stage error + one create-stage error
    expect(res.failed).toBe(2);
    expect(res.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 3, sku: 'BAD' }),
        expect.objectContaining({ row: 1, sku: 'DUP', message: expect.stringMatching(/SKU/i) }),
      ]),
    );
  });

  it('rejects when no file was uploaded', async () => {
    const { ctrl } = build();
    await expect(ctrl.import(SELLER_ID, undefined as never)).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Run — verify it fails**

Run: `cd apps/api && npm test -- seller-products.controller`
Expected: FAIL — `ctrl.import` undefined / ctor arity.

- [ ] **Step 3: Implement the import handler + constructor injection**

In `apps/api/src/products/seller-products.controller.ts`, add imports and inject the service:

```ts
import {
  // ...existing...
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProductCsvImportService, MAX_IMPORT_BYTES } from './product-csv-import.service';
import { ImportResult, RowError } from './dto/import-result.dto';
```

Constructor:

```ts
  constructor(
    private readonly products: ProductsService,
    private readonly csvImport: ProductCsvImportService,
  ) {}
```

Handler (add to the class):

```ts
  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_BYTES } }),
  )
  async import(
    @CurrentSeller() sellerId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ImportResult> {
    if (!file) {
      throw new BadRequestException('A CSV file is required (field "file")');
    }
    const { valid, errors: parseErrors } = this.csvImport.parseAndValidate(
      file.buffer,
    );

    const actor = this.actor(sellerId);
    const productIds: string[] = [];
    const errors: RowError[] = [...parseErrors];

    for (const { dto, row } of valid) {
      try {
        const created = await this.products.create(dto, actor);
        productIds.push(created.id);
      } catch (err) {
        errors.push({
          row,
          sku: dto.sku,
          message: err instanceof Error ? err.message : 'Failed to create',
        });
      }
    }

    return {
      created: productIds.length,
      failed: errors.length,
      productIds,
      errors,
    };
  }
```

(Note: rows are created sequentially so each `create`'s per-seller dup-SKU conflict is isolated to that row. `Express.Multer.File` types come from `@types/express` + multer — already present via `@nestjs/platform-express`/`@types/express`. If the `Express.Multer` namespace isn't resolved, add `import type { Express } from 'express';` or reference `@types/multer` — confirm tsc resolves it.)

- [ ] **Step 4: Provide the import service in the module**

In `apps/api/src/products/products.module.ts`, add `ProductCsvImportService` to `providers`:

```ts
import { ProductCsvImportService } from './product-csv-import.service';
// ...
  providers: [ProductsService, SellerApprovedGuard, ProductCsvImportService],
```

- [ ] **Step 5: Run the controller spec — verify green**

Run: `cd apps/api && npm test -- seller-products.controller`
Expected: PASS — existing 6 + 3 new import tests.

- [ ] **Step 6: tsc + full suite + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm test && npm run lint`
Expected: 0 tsc errors; full suite green; lint clean. If `Express.Multer.File` fails tsc, resolve the multer type (see Step 3 note) before proceeding.

- [ ] **Step 7: Boot smoke — route mapped**

Run `npm run start:dev` (background); poll `localhost:5000/products` for 200; confirm `Mapped {/seller/products/import, POST}` in the boot log; stop the server.
Expected: route mapped; app boots clean.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/products/seller-products.controller.ts apps/api/src/products/seller-products.controller.spec.ts apps/api/src/products/products.module.ts
git commit -m "feat(m2): POST /seller/products/import — CSV bulk import with per-row report"
```

---

### Task 3: e2e — CSV import over HTTP (partial success + ownership + caps)

**Files:**
- Modify: `apps/api/test/seller-products.e2e-spec.ts`

**Interfaces:**
- Consumes: the running app + the seeded ACTIVE sellers/tokens already set up in this e2e (slice 3). Proves the import end-to-end.

- [ ] **Step 1: Add the import e2e cases**

In the existing `apps/api/test/seller-products.e2e-spec.ts`, add a describe block using Supertest's `.attach()` for multipart upload. Cover:

1. **Partial success:** upload a CSV with 2 valid rows + 1 invalid (e.g. empty name) using a valid seeded `categoryId` → 201/200 with `{ created: 2, failed: 1, errors: [one entry] }`; the 2 created products are owned by the uploading seller (assert via `GET /seller/products` includes them; the other seller's list does not).
2. **Ownership ignores any sellerId column:** include a `sellerId` column pointing at the OTHER seller in a row → the created product is still owned by the uploader (the import never reads sellerId from the file). (If `CreateProductDto`'s `forbidNonWhitelisted` would reject an unknown `sellerId` column at the row-validation stage, that row simply errors — either outcome proves the file can't set ownership; assert the product is NOT owned by the other seller.)
3. **Own-SKU conflict is per-row:** upload a CSV where one row reuses a SKU the seller already owns (create it first) + one fresh row → `created: 1, failed: 1`, the conflict row reported with its SKU.
4. **Row cap:** upload a CSV exceeding MAX_IMPORT_ROWS → 400.
5. **Missing file:** POST with no file attached → 400.
   (File-size cap is awkward to exercise without a >1MiB fixture; rely on the unit/multer config for that, and note it.)

Use Supertest:

```ts
await request(app.getHttpServer())
  .post('/seller/products/import')
  .set('Authorization', `Bearer ${tokenA}`)
  .attach('file', Buffer.from(csvString), 'products.csv')
  .expect(201); // or 200 — match what the handler returns (POST default 201)
```

Build CSV strings inline with the seeded `categoryId` fetched in the existing `beforeAll`. Track created product ids/SKUs in the test namespace and clean them up in the existing `afterAll` (the seller-scoped product cleanup already deletes by `sellerId in [...]`, so new products are covered — confirm).

- [ ] **Step 2: Run the e2e suite**

Run: `cd apps/api && npm run test:e2e`
Expected: PASS — existing 17 + new import cases. (Seed first if needed: `npx prisma db seed`.)

- [ ] **Step 3: tsc + lint**

Run: `cd apps/api && npx tsc -p tsconfig.build.json --noEmit && npm run lint`
Expected: 0 tsc errors; lint clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test/seller-products.e2e-spec.ts
git commit -m "test(m2): e2e seller CSV import (partial success, ownership forced, caps)"
```

---

### Task 4: Slice verification gate + tracker

**Files:**
- Modify: `docs/IMPLEMENTATION_PLAN.md`

- [ ] **Step 1: Full slice gate**

From `apps/api`: `npm test` (full), `npm run test:e2e`, `npm run lint`, `npx tsc -p tsconfig.build.json --noEmit` (0 errors). From repo root: `git status --porcelain` (clean), `git worktree list` (the `.claude/worktrees/improvment-UI` worktree is an ACTIVE other-agent worktree — EXPECTED, do not flag or touch it; ignore it in the stray check).
Expected: all green.

- [ ] **Step 2: HTTP smoke**

Boot the app. As an ACTIVE seller, `curl -F file=@<small.csv>` to `POST /seller/products/import` with 2 valid + 1 bad row → report shows `created:2, failed:1`; `GET /seller/products` shows the 2 new products owned by that seller. Clean up created rows. Stop the server.

- [ ] **Step 3: Update tracker**

In `docs/IMPLEMENTATION_PLAN.md`, append to the M2 row: "slice 4 (CSV bulk import POST /seller/products/import — multipart, size/row caps, per-row report, seller-owned) done; next: slice 5 seller inventory API."

- [ ] **Step 4: Commit**

```bash
git add docs/IMPLEMENTATION_PLAN.md
git commit -m "docs(m2): mark slice 4 (CSV bulk import) done"
```

- [ ] **Step 5: STOP and ask the user to verify (RULE.md §1)**

Summarize; note slice 5 is seller inventory API. Do not push.

---

## Self-Review

**Spec coverage (against `2026-06-22-m2-seller-system-design.md` §CSV import + §Slice plan row 4):**
- `POST /seller/products/import`, seller-scoped → Task 2 (on the seller-gated controller). ✓
- Size + row caps → `MAX_IMPORT_BYTES` (multer limit, Task 2) + `MAX_IMPORT_ROWS` (Task 1). ✓
- Per-row validation reusing `CreateProductDto` → Task 1 (`validateSync` on `plainToInstance`). ✓
- Per-row result report, not all-or-nothing → `ImportResult` with `errors[]`; sequential create collects failures (Tasks 1–2). ✓
- Per-seller SKU: own-dup row fails, others import → Task 2 (per-row try/catch around `ProductsService.create`) + e2e case 3. ✓
- Created products owned by the acting seller → reuses `ProductsService.create(dto, {role:SELLER, sellerId})`; file's sellerId never trusted → e2e case 2. ✓

**Placeholder scan:** No TBD/TODO. The e2e cases (Task 3) are enumerated with expected outcomes rather than full code, because they extend an existing spec whose setup/cleanup must be matched (Step 1 of slice-3's e2e established the harness) — concrete requirements, not vague. Unit + controller code is given in full.

**Type consistency:** `CreateProductDto` (existing) is the validation target. `ProductsService.create(dto, actor)` consumed as defined in slice 2. `ImportResult`/`RowError` defined in Task 1, used in Task 2. `MAX_IMPORT_BYTES` shared between the service (Task 1) and the multer limit (Task 2). `Express.Multer.File` flagged as the one type to confirm resolves under tsc (Task 2 Step 3/6).

**Dependency note:** `csv-parse` is the one new dependency; its install is explicitly gated on user confirmation (Task 1 Step 0) per RULE.md §3. It ships its own types. Chosen over a hand parser for CSV-correctness (quoting/embedded commas), verified by a dedicated unit test (Task 1 Step 1, the quoted-comma case).
