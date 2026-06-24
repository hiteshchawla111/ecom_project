-- K2: GIN full-text index for product search (M3c).
-- CONCURRENTLY must NOT run inside a transaction; this file contains only this statement.
-- coalesce(description,'') keeps a NULL description from nulling the whole tsvector.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Product_fts_idx" ON "Product"
  USING GIN (to_tsvector('english', "name" || ' ' || coalesce("description", '')));
