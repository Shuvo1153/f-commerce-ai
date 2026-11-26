import { Prisma } from "@prisma/client";

export async function releaseReservedStock(
  transaction: Prisma.TransactionClient,
  orderId: string,
) {
  const sellerOrders = await transaction.sellerOrder.findMany({
    where: { orderId },
    select: {
      items: {
        select: { productId: true, quantity: true },
      },
    },
  });
  const quantities = new Map<string, number>();
  for (const item of sellerOrders.flatMap((sellerOrder) => sellerOrder.items)) {
    quantities.set(item.productId, (quantities.get(item.productId) || 0) + item.quantity);
  }
  for (const [productId, quantity] of quantities) {
    await transaction.product.update({
      where: { id: productId },
      data: { stockQuantity: { increment: quantity } },
    });
  }
}
