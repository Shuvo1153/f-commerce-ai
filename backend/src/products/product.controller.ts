import { Controller, Get, Param, Query } from "@nestjs/common";
import { PrismaService } from "../prisma.service";

@Controller("products")
export class ProductController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list(@Query("search") search?: string) {
    return this.prisma.product.findMany({
      where: search ? { name: { contains: search, mode: "insensitive" }, status: "ACTIVE" } : { status: "ACTIVE" },
      include: {
        images: true,
        variants: true,
        category: true,
        seller: { select: { businessName: true } },
      },
      take: 50,
    });
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        images: true,
        variants: true,
        category: true,
        seller: { select: { businessName: true } },
        reviews: true,
      },
    });
  }
}
