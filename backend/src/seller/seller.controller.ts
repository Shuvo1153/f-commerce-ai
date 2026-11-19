import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Header,
  Headers,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Patch,
  Post,
  Body,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
  StreamableFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join } from "path";
import { getUserIdFromAuthorization } from "../auth/access-token";
import { PrismaService } from "../prisma.service";

const uploadsDirectory = join(__dirname, "..", "..", "..", "uploads");

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== "string") throw new BadRequestException(`${field} is required.`);
  const text = value.trim();
  if (!text || text.length > maximumLength) {
    throw new BadRequestException(`${field} must contain between 1 and ${maximumLength} characters.`);
  }
  return text;
}

function parsePrice(value: unknown, field: string): Prisma.Decimal {
  if ((typeof value !== "string" && typeof value !== "number") ||
      !/^\d{1,10}(?:\.\d{1,2})?$/.test(String(value).trim())) {
    throw new BadRequestException(`${field} must be a positive amount with up to two decimal places.`);
  }
  const price = new Prisma.Decimal(String(value).trim());
  if (price.lte(0)) throw new BadRequestException(`${field} must be greater than zero.`);
  return price;
}

function createSlug(value: string): string {
  const base = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "product";
  return `${base}-${randomUUID().slice(0, 8)}`;
}

@Controller("seller")
export class SellerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  async getSellerProfile(@Headers("authorization") authorization?: string) {
    const userId = getUserIdFromAuthorization(authorization);
    const [sellerProfile, categories] = await Promise.all([
      this.prisma.sellerProfile.findUnique({
        where: { userId },
        include: {
          products: {
            orderBy: { createdAt: "desc" },
            include: {
              category: true,
              images: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      }),
      this.prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { sellerProfile, categories };
  }

  @Get("dashboard")
  async getDashboard(@Headers("authorization") authorization?: string) {
    const userId = getUserIdFromAuthorization(authorization);
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true, businessName: true, businessEmail: true, businessPhone: true, verificationStatus: true },
    });
    if (!seller) throw new NotFoundException("Create a business profile to access the seller dashboard.");

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const firstChartMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const [products, categories, orders, sales, monthlyOrders, pendingOrders] = await Promise.all([
      this.prisma.product.findMany({
        where: { sellerId: seller.id },
        orderBy: { createdAt: "desc" },
        include: { category: true, images: { orderBy: { sortOrder: "asc" } } },
      }),
      this.prisma.category.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.sellerOrder.findMany({
        where: { sellerId: seller.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          order: { select: { orderNumber: true, shippingAddressSnapshot: true, paymentStatus: true } },
          items: { select: { productNameSnapshot: true, quantity: true, unitPrice: true, subtotal: true } },
        },
      }),
      this.prisma.sellerOrder.aggregate({
        where: { sellerId: seller.id, status: { not: "CANCELLED" } },
        _sum: { subtotal: true },
        _count: { _all: true },
      }),
      this.prisma.sellerOrder.findMany({
        where: { sellerId: seller.id, status: { not: "CANCELLED" }, createdAt: { gte: firstChartMonth } },
        select: { subtotal: true, createdAt: true },
      }),
      this.prisma.sellerOrder.count({ where: { sellerId: seller.id, status: "PENDING" } }),
    ]);

    const monthlySales = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
      const amount = monthlyOrders
        .filter((order) => `${order.createdAt.getUTCFullYear()}-${String(order.createdAt.getUTCMonth() + 1).padStart(2, "0")}` === key)
        .reduce((total, order) => total + Number(order.subtotal), 0);
      return {
        month: date.toLocaleDateString("en-BD", { month: "short", timeZone: "UTC" }),
        total: amount.toFixed(2),
      };
    });
    const currentMonthSales = Number(monthlySales[5].total);
    const previousMonthSales = Number(monthlySales[4].total);
    const growthPercent = previousMonthSales === 0
      ? (currentMonthSales === 0 ? 0 : null)
      : Number((((currentMonthSales - previousMonthSales) / previousMonthSales) * 100).toFixed(1));

    return {
      seller,
      products,
      categories,
      orders,
      metrics: {
        totalSales: (sales._sum.subtotal || new Prisma.Decimal(0)).toString(),
        totalOrders: sales._count._all,
        pendingOrders,
        activeProducts: products.filter((product) => product.status === "ACTIVE").length,
        currentMonthSales: currentMonthSales.toFixed(2),
        growthPercent,
        monthlySales,
      },
    };
  }

  @Post("register")
  async registerSeller(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    const userId = getUserIdFromAuthorization(authorization);
    if (!isRecord(body)) throw new BadRequestException("Business details are required.");

    const businessName = requiredText(body.businessName, "Business name", 120);
    const businessEmail = requiredText(body.businessEmail, "Business email", 254).toLowerCase();
    const businessPhone = requiredText(body.businessPhone, "Business phone", 30);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
      throw new BadRequestException("Enter a valid business email address.");
    }

    if (await this.prisma.sellerProfile.findUnique({ where: { userId }, select: { id: true } })) {
      throw new ConflictException("This account already has a business profile.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new UnauthorizedException("Your session is no longer valid. Please sign in again.");

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const sellerProfile = await transaction.sellerProfile.create({
          data: {
            userId,
            businessName,
            businessEmail,
            businessPhone,
            verificationStatus: "VERIFIED",
          },
        });
        await transaction.userRole.createMany({
          data: { userId, role: "SELLER" },
          skipDuplicates: true,
        });
        return sellerProfile;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This account already has a business profile.");
      }
      throw error;
    }
  }

  @Post("products")
  @UseInterceptors(FileInterceptor("image", {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
        callback(new BadRequestException("Upload a JPEG, PNG, or WebP product image."), false);
        return;
      }
      callback(null, true);
    },
  }))
  async createProduct(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    const userId = getUserIdFromAuthorization(authorization);
    if (!isRecord(body)) throw new BadRequestException("Product details are required.");

    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true, verificationStatus: true },
    });
    if (!seller || seller.verificationStatus !== "VERIFIED") {
      throw new ConflictException("Create and verify your business profile before listing products.");
    }

    const name = requiredText(body.name, "Product name", 160);
    const brand = requiredText(body.brand, "Brand", 100);
    const description = requiredText(body.description, "Description", 2000);
    const categoryId = requiredText(body.categoryId, "Category", 100);
    const price = parsePrice(body.price, "Price");
    const discountPrice = body.discountPrice === undefined || body.discountPrice === null ||
      body.discountPrice === "" ? null : parsePrice(body.discountPrice, "Discount price");
    if (discountPrice && discountPrice.gte(price)) {
      throw new BadRequestException("Discount price must be less than the regular price.");
    }
    const category = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) throw new BadRequestException("Choose a valid product category.");

    const savedImage = file ? await this.saveProductImage(file) : null;
    try {
      return await this.prisma.product.create({
        data: {
          sellerId: seller.id,
          categoryId,
          name,
          slug: createSlug(name),
          brand,
          description,
          price,
          discountPrice,
          status: "ACTIVE",
          ...(savedImage ? { images: { create: { imageUrl: savedImage.url, isPrimary: true } } } : {}),
        },
        include: { category: true, images: true },
      });
    } catch (error) {
      if (savedImage?.path) await unlink(savedImage.path);
      if (savedImage?.storagePath) await this.deleteProductImage(savedImage.storagePath);
      throw error;
    }
  }

  @Get("product-images/:filename")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  @Header("X-Content-Type-Options", "nosniff")
  async getProductImage(@Param("filename") filename: string) {
    const match = filename.match(/^([0-9a-f-]{36})\.(jpg|png|webp)$/);
    if (!match) throw new BadRequestException("Invalid product image name.");
    const contentType = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[match[2]];
    try {
      return new StreamableFile(await readFile(join(uploadsDirectory, filename)), {
        type: contentType,
        disposition: "inline",
      });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        throw new NotFoundException("Product image not found.");
      }
      throw error;
    }
  }

  private async saveProductImage(file: { buffer: Buffer; mimetype: string }) {
    let extension: "jpg" | "png" | "webp";
    if (file.buffer.length >= 3 && file.buffer[0] === 0xff && file.buffer[1] === 0xd8 && file.buffer[2] === 0xff) {
      extension = "jpg";
    } else if (file.buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      extension = "png";
    } else if (file.buffer.length >= 12 &&
        file.buffer.toString("ascii", 0, 4) === "RIFF" &&
        file.buffer.toString("ascii", 8, 12) === "WEBP") {
      extension = "webp";
    } else {
      throw new BadRequestException("The uploaded file is not a valid JPEG, PNG, or WebP image.");
    }

    const expectedMimeType = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" }[extension];
    if (file.mimetype !== expectedMimeType) {
      throw new BadRequestException("The uploaded image type does not match its file contents.");
    }

    const filename = `${randomUUID()}.${extension}`;
    const storage = this.getSupabaseStorageConfig();
    if (storage) {
      const objectPath = `${encodeURIComponent(storage.bucket)}/${filename}`;
      const response = await fetch(`${storage.url}/storage/v1/object/${objectPath}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${storage.serviceRoleKey}`,
          apikey: storage.serviceRoleKey,
          "Content-Type": expectedMimeType,
          "x-upsert": "false",
        },
        body: new Uint8Array(file.buffer),
      });
      if (!response.ok) {
        throw new InternalServerErrorException(
          `Supabase Storage could not save the product image (HTTP ${response.status}).`,
        );
      }
      return {
        storagePath: objectPath,
        url: `${storage.url}/storage/v1/object/public/${objectPath}`,
      };
    }

    const path = join(uploadsDirectory, filename);
    await mkdir(uploadsDirectory, { recursive: true });
    await writeFile(path, file.buffer, { flag: "wx" });
    return { path, url: `/api/v1/seller/product-images/${filename}` };
  }

  private getSupabaseStorageConfig() {
    const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url && !serviceRoleKey) return null;
    if (!url || !serviceRoleKey) {
      throw new InternalServerErrorException("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be configured.");
    }
    return {
      url,
      serviceRoleKey,
      bucket: process.env.SUPABASE_STORAGE_BUCKET || "product-images",
    };
  }

  private async deleteProductImage(storagePath: string) {
    const storage = this.getSupabaseStorageConfig();
    if (!storage) {
      throw new InternalServerErrorException("Supabase Storage configuration is required to remove the uploaded image.");
    }
    const [bucket, ...pathParts] = storagePath.split("/");
    const response = await fetch(`${storage.url}/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${storage.serviceRoleKey}`,
        apikey: storage.serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prefixes: [pathParts.join("/")] }),
    });
    if (!response.ok) {
      throw new InternalServerErrorException(
        `Supabase Storage could not remove the product image (HTTP ${response.status}).`,
      );
    }
  }

  @Patch("orders/:id/confirm")
  async confirmSellerOrder(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
  ) {
    const userId = getUserIdFromAuthorization(authorization);
    const seller = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      select: { id: true, verificationStatus: true },
    });
    if (!seller || seller.verificationStatus !== "VERIFIED") {
      throw new ConflictException("An active business profile is required to confirm orders.");
    }

    const sellerOrder = await this.prisma.sellerOrder.findFirst({
      where: { id, sellerId: seller.id },
      select: { id: true, orderId: true, status: true },
    });
    if (!sellerOrder) throw new NotFoundException("Order not found for this business.");
    if (sellerOrder.status !== "PENDING") {
      throw new ConflictException("This order has already been processed.");
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.sellerOrder.update({ where: { id }, data: { status: "CONFIRMED" } });
      await transaction.orderStatusHistory.create({
        data: {
          sellerOrderId: id,
          previousStatus: sellerOrder.status,
          newStatus: "CONFIRMED",
          changedBy: userId,
        },
      });
      const remainingOrders = await transaction.sellerOrder.findMany({
        where: { orderId: sellerOrder.orderId },
        select: { status: true },
      });
      if (remainingOrders.every((item) => item.status !== "PENDING")) {
        await transaction.order.update({ where: { id: sellerOrder.orderId }, data: { orderStatus: "CONFIRMED" } });
      }
    });

    return { id, status: "CONFIRMED" };
  }
}
