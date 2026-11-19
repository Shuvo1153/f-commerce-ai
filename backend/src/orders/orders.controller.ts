import { BadRequestException, Body, Controller, Get, Headers, Post, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { getUserIdFromAuthorization } from "../auth/access-token";
import { PrismaService } from "../prisma.service";

type ShippingAddress = {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseShippingAddress(value: unknown): ShippingAddress {
  if (!isRecord(value)) {
    throw new BadRequestException("A delivery address is required.");
  }
  const fields = ["fullName", "phone", "addressLine", "city", "postalCode"] as const;
  const address = Object.fromEntries(
    fields.map((field) => [field, typeof value[field] === "string" ? value[field].trim() : ""]),
  ) as Record<(typeof fields)[number], string>;
  if (fields.some((field) => !address[field])) {
    throw new BadRequestException("Name, phone, street address, city, and postal code are required.");
  }
  if (address.fullName.length > 100 || address.phone.length > 30 ||
      address.addressLine.length > 300 || address.city.length > 100 ||
      address.postalCode.length > 20) {
    throw new BadRequestException("One or more delivery address fields are too long.");
  }
  const country = typeof value.country === "string" ? value.country.trim() : "Bangladesh";
  if (!country || country.length > 100) {
    throw new BadRequestException("Enter a valid delivery country.");
  }
  return { ...address, country };
}

@Controller("orders")
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("mine")
  async purchaseHistory(@Headers("authorization") authorization?: string) {
    const customerId = getUserIdFromAuthorization(authorization);
    const orders = await this.prisma.order.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        orderNumber: true,
        orderStatus: true,
        paymentStatus: true,
        totalAmount: true,
        createdAt: true,
        sellerOrders: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            status: true,
            subtotal: true,
            seller: { select: { businessName: true } },
            items: {
              select: {
                productNameSnapshot: true,
                quantity: true,
                unitPrice: true,
                subtotal: true,
              },
            },
          },
        },
      },
    });
    return { orders };
  }

  @Post()
  async placeOrder(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    const customerId = getUserIdFromAuthorization(authorization, "Sign in to place an order.");
    if (!isRecord(body) || !Array.isArray(body.items) || body.items.length === 0 || body.items.length > 50) {
      throw new BadRequestException("Your cart is empty or invalid.");
    }

    const quantities = new Map<string, number>();
    for (const item of body.items) {
      const requestedQuantity = isRecord(item) ? item.quantity : undefined;
      if (!isRecord(item) || typeof item.productId !== "string" ||
          !item.productId.trim() || typeof requestedQuantity !== "number" ||
          !Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 99) {
        throw new BadRequestException("The cart contains an invalid product or quantity.");
      }
      const productId = item.productId.trim();
      const quantity = (quantities.get(productId) || 0) + requestedQuantity;
      if (quantity > 99) {
        throw new BadRequestException("Product quantities cannot exceed 99.");
      }
      quantities.set(productId, quantity);
    }
    const shippingAddress = parseShippingAddress(body.shippingAddress);
    const products = await this.prisma.product.findMany({
      where: { id: { in: Array.from(quantities.keys()) }, status: "ACTIVE" },
      select: { id: true, name: true, sellerId: true, price: true, discountPrice: true },
    });
    if (products.length !== quantities.size) {
      throw new BadRequestException("One or more products in your cart are no longer available.");
    }

    const productById = new Map(products.map((product) => [product.id, product]));
    const lineItems = Array.from(quantities, ([productId, quantity]) => {
      const product = productById.get(productId);
      if (!product) throw new BadRequestException("A product in your cart is no longer available.");
      const unitPrice = product.discountPrice ?? product.price;
      return { product, quantity, unitPrice, subtotal: unitPrice.mul(quantity) };
    });
    const subtotal = lineItems.reduce(
      (total, item) => total.add(item.subtotal),
      new Prisma.Decimal(0),
    );
    const orderNumber = `FC-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;

    const order = await this.prisma.$transaction(async (transaction) => {
      const customer = await transaction.user.findUnique({ where: { id: customerId }, select: { id: true } });
      if (!customer) throw new UnauthorizedException("Your session is no longer valid. Please sign in again.");

      const createdOrder = await transaction.order.create({
        data: {
          orderNumber,
          customerId,
          shippingAddressSnapshot: shippingAddress,
          subtotal,
          totalAmount: subtotal,
        },
      });

      const itemsBySeller = new Map<string, typeof lineItems>();
      for (const item of lineItems) {
        const sellerItems = itemsBySeller.get(item.product.sellerId) || [];
        sellerItems.push(item);
        itemsBySeller.set(item.product.sellerId, sellerItems);
      }
      for (const [sellerId, sellerItems] of itemsBySeller) {
        const sellerSubtotal = sellerItems.reduce(
          (total, item) => total.add(item.subtotal),
          new Prisma.Decimal(0),
        );
        await transaction.sellerOrder.create({
          data: {
            orderId: createdOrder.id,
            sellerId,
            subtotal: sellerSubtotal,
            items: {
              create: sellerItems.map(({ product, quantity, unitPrice, subtotal: itemSubtotal }) => ({
                productId: product.id,
                productNameSnapshot: product.name,
                unitPrice,
                quantity,
                subtotal: itemSubtotal,
              })),
            },
          },
        });
      }
      await transaction.payment.create({
        data: {
          orderId: createdOrder.id,
          paymentMethod: "CASH_ON_DELIVERY",
          transactionId: `COD-${createdOrder.id}`,
          amount: subtotal,
          paymentStatus: "PENDING",
        },
      });
      return createdOrder;
    });

    return {
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentMethod: "CASH_ON_DELIVERY",
      totalAmount: order.totalAmount.toString(),
    };
  }
}
