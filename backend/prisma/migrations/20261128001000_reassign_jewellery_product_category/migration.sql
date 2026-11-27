UPDATE "Product" AS product
SET "categoryId" = new_category."id"
FROM "Category" AS old_category, "Category" AS new_category
WHERE product."id" = '01aa8297-1b09-47ef-874c-d1ea12480a0b'
  AND product."categoryId" = old_category."id"
  AND old_category."slug" = 'dresses'
  AND new_category."slug" = 'jewellery-collection';
