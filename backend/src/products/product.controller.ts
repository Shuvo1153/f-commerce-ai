import { Controller, Get, NotFoundException, Param, Query } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Controller("products")
export class ProductController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query("search") search?: string) {
    return this.prisma.product.findMany({
      where: search
        ? {
          status: "ACTIVE",
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { brand: { contains: search, mode: "insensitive" } },
          ],
        }
        : { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      include: {
        images: true,
        variants: true,
        category: true,
        seller: { select: { businessName: true } },
      },
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, status: "ACTIVE" },
      include: {
        images: { orderBy: { sortOrder: "asc" } },
        variants: {
          select: { id: true, variantName: true, variantValue: true, priceAdjustment: true, stockQuantity: true },
        },
        category: { select: { name: true, slug: true } },
        seller: { select: { businessName: true } },
        reviews: {
          select: { id: true, rating: true, comment: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!product) throw new NotFoundException("Product not found.");
    return product;
  }
}
