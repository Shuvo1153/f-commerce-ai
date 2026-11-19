import { PrismaClient, ProductStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const user = await prisma.user.upsert({
    where: { email: "demo@fcommerce.local" },
    update: { passwordHash },
    create: { name: "Demo Customer", email: "demo@fcommerce.local", passwordHash },
  });
  await prisma.userRole.createMany({
    data: [
      { userId: user.id, role: "CUSTOMER" },
      { userId: user.id, role: "SELLER" },
    ],
    skipDuplicates: true,
  });
  const seller = await prisma.sellerProfile.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, businessName: "Demo Store", businessEmail: "seller@fcommerce.local", businessPhone: "+8801700000000", verificationStatus: "VERIFIED" },
  });
  await prisma.store.upsert({
    where: { storeSlug: "demo-store" },
    update: {},
    create: { sellerId: seller.id, storeName: "Demo Store", storeSlug: "demo-store", description: "Curated electronics and lifestyle products." },
  });
  const categoryDefinitions = [
    { name: "Electronics", slug: "electronics" },
    { name: "Shirts", slug: "shirts" },
    { name: "Pants", slug: "pants" },
    { name: "Sneakers", slug: "sneakers" },
    { name: "Perfumes", slug: "perfumes" },
    { name: "Women's Collection", slug: "dresses" },
    { name: "Bags", slug: "bags" },
  ];
  const categoryIds: Record<string, string> = {};
  for (const category of categoryDefinitions) {
    const savedCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: { name: category.name },
      create: category,
    });
    categoryIds[category.slug] = savedCategory.id;
  }

  const products = [
    { name: "Samsung Galaxy A55 5G", slug: "samsung-galaxy-a55-5g", brand: "Samsung", price: "42999", description: "Global 5G, 50MP camera, 5000mAh battery", category: "electronics" },
    { name: "Sony WH-1000XM5", slug: "sony-wh-1000xm5", brand: "Sony", price: "36500", description: "Noise-cancelling wireless headphones", category: "electronics" },
    { name: "Apple MacBook Air M3", slug: "apple-macbook-air-m3", brand: "Apple", price: "132000", description: "M3 chip, 13-inch Liquid Retina display", category: "electronics" },
    { name: "Everyday Oxford Cotton Shirt", slug: "everyday-oxford-cotton-shirt", brand: "Thread & Co.", price: "1850", description: "A breathable cotton button-down for work and weekends.", category: "shirts" },
    { name: "Classic Straight-Fit Denim", slug: "classic-straight-fit-denim", brand: "Northline", price: "2450", description: "Comfort-stretch denim with a timeless straight fit.", category: "pants" },
    { name: "Court Classic Low Sneakers", slug: "court-classic-low-sneakers", brand: "Stride", price: "3450", description: "Everyday low-top sneakers with a cushioned sole.", category: "sneakers" },
    { name: "Cedar & Amber Eau de Parfum", slug: "cedar-amber-eau-de-parfum", brand: "Scent Studio", price: "2200", description: "A warm, long-lasting woody fragrance in a 50 ml bottle.", category: "perfumes" },
    { name: "Floral Everyday Midi Dress", slug: "floral-everyday-midi-dress", brand: "Bloom & Thread", price: "2890", description: "A light, easy-to-wear floral dress with a flowing midi hem.", category: "dresses" },
    { name: "City Daypack", slug: "city-daypack", brand: "Fieldwork", price: "1750", description: "A compact, durable bag for commuting and day trips.", category: "bags" },
  ] as const;

  for (const product of products) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        categoryId: categoryIds[product.category],
        status: ProductStatus.ACTIVE,
      },
      create: {
        sellerId: seller.id,
        categoryId: categoryIds[product.category],
        name: product.name,
        slug: product.slug,
        brand: product.brand,
        description: product.description,
        price: product.price,
        status: ProductStatus.ACTIVE,
      },
    });
  }
  console.log(`Seeded demo marketplace data with ${categoryDefinitions.length} categories and ${products.length} products`);
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
