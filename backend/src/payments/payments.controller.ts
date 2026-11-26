import { Body, Controller, Get, Headers, NotFoundException, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { getUserIdFromAuthorization } from "../auth/access-token";
import { PrismaService } from "../prisma.service";
import { SslcommerzService } from "./sslcommerz.service";

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sslcommerz: SslcommerzService,
  ) {}

  @Get("orders/:orderNumber")
  async getOrderPaymentStatus(
    @Headers("authorization") authorization: string | undefined,
    @Param("orderNumber") orderNumber: string,
  ) {
    const customerId = getUserIdFromAuthorization(authorization);
    const order = await this.prisma.order.findFirst({
      where: { orderNumber, customerId },
      select: {
        orderNumber: true,
        orderStatus: true,
        paymentStatus: true,
        payments: {
          orderBy: { paidAt: "desc" },
          take: 1,
          select: { paymentMethod: true, paymentStatus: true },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found.");
    return {
      orderNumber: order.orderNumber,
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.payments[0]?.paymentMethod || "CASH_ON_DELIVERY",
    };
  }

  @Post("sslcommerz/success")
  async success(@Body() body: unknown, @Res() response: Response) {
    const orderNumber = await this.sslcommerz.confirmPayment(body);
    return response.redirect(303, this.sslcommerz.getResultUrl(orderNumber, "success"));
  }

  @Post("sslcommerz/fail")
  async fail(@Body() body: unknown, @Res() response: Response) {
    const orderNumber = await this.sslcommerz.markUnsuccessful(body, "FAILED");
    return response.redirect(303, this.sslcommerz.getResultUrl(orderNumber, "failed"));
  }

  @Post("sslcommerz/cancel")
  async cancel(@Body() body: unknown, @Res() response: Response) {
    const orderNumber = await this.sslcommerz.markUnsuccessful(body, "CANCELLED");
    return response.redirect(303, this.sslcommerz.getResultUrl(orderNumber, "cancelled"));
  }

  @Post("sslcommerz/ipn")
  async ipn(@Body() body: unknown) {
    await this.sslcommerz.confirmPayment(body);
    return { received: true };
  }
}
