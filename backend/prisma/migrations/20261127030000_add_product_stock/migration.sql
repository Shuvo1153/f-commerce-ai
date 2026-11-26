ALTER TABLE "Product"
ADD COLUMN "stockQuantity" INTEGER NOT NULL DEFAULT 0;

UPDATE "Product" AS product
SET "stockQuantity" = COALESCE((
  SELECT SUM(variant."stockQuantity")::INTEGER
  FROM "ProductVariant" AS variant
  WHERE variant."productId" = product."id"
), 0);
