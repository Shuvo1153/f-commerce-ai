const { readFile } = require("node:fs/promises");
const { join } = require("node:path");
const { PrismaClient } = require("@prisma/client");

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_STORAGE_BUCKET || "product-images";
const databaseUrl = process.env.DIRECT_URL;

if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
  throw new Error("DIRECT_URL, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY must be configured in .env.");
}

const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const uploadsDirectory = join(__dirname, "..", "backend", "uploads");
const extensions = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

async function main() {
  const images = await prisma.productImage.findMany({
    where: { imageUrl: { startsWith: "/api/v1/seller/product-images/" } },
    select: { id: true, imageUrl: true },
  });

  for (const image of images) {
    const match = image.imageUrl.match(/^\/api\/v1\/seller\/product-images\/([0-9a-f-]{36})\.(jpg|png|webp)$/i);
    if (!match) throw new Error(`Unsupported local product image URL: ${image.imageUrl}`);

    const filename = `${match[1]}.${match[2].toLowerCase()}`;
    const imageBuffer = await readFile(join(uploadsDirectory, filename));
    const objectPath = `${encodeURIComponent(bucket)}/${filename}`;
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${objectPath}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": extensions[match[2].toLowerCase()],
        "x-upsert": "true",
      },
      body: new Uint8Array(imageBuffer),
    });
    if (!response.ok) {
      throw new Error(`Supabase Storage could not migrate ${filename} (HTTP ${response.status}).`);
    }

    await prisma.productImage.update({
      where: { id: image.id },
      data: { imageUrl: `${supabaseUrl}/storage/v1/object/public/${objectPath}` },
    });
    console.log(`Migrated ${filename}`);
  }

  console.log(`Migrated ${images.length} product image(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
