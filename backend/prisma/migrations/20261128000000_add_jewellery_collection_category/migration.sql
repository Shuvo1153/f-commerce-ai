INSERT INTO "Category" ("id", "name", "slug")
VALUES ('df110f65-51ce-4b24-a8a6-9d8995b39f65', 'Jewellery Collection', 'jewellery-collection')
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name";
