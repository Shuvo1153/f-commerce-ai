import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { releaseReservedStock } from "../orders/inventory";

type PaymentContact = {
  name: string;
  email: string;
};

type PaymentAddress = {
  fullName: string;
  phone: string;
  addressLine: string;
  city: string;
  postalCode: string;
  country: string;
};

type GatewayConfig = {
  storeId: string;
  storePassword: string;
  backendUrl: string;
  frontendUrl: string;
  apiUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

@Injectable()
export class SslcommerzService {
  constructor(private readonly prisma: PrismaService) {}

  assertConfigured() {
    this.getConfig();
  }

  async createHostedSession(input: {
    transactionId: string;
    amount: Prisma.Decimal;
    contact: PaymentContact;
    address: PaymentAddress;
    itemCount: number;
  }): Promise<string> {
    if (input.amount.lt(10) || input.amount.gt(500000)) {
      throw new BadRequestException("Online payments must be between ৳10.00 and ৳500,000.00.");
    }
    if (!input.contact.email || input.contact.email.length > 50) {
      throw new BadRequestException("SSLCommerz requires a customer email address of 50 characters or fewer.");
    }

    const config = this.getConfig();
    const callbacksUrl = `${config.backendUrl}/api/v1/payments/sslcommerz`;
    const form = new URLSearchParams({
      store_id: config.storeId,
      store_passwd: config.storePassword,
      total_amount: input.amount.toFixed(2),
      currency: "BDT",
      tran_id: input.transactionId,
      success_url: `${callbacksUrl}/success`,
      fail_url: `${callbacksUrl}/fail`,
      cancel_url: `${callbacksUrl}/cancel`,
      ipn_url: `${callbacksUrl}/ipn`,
      product_category: "Marketplace",
      product_name: "Marketplace order",
      product_profile: "physical-goods",
      shipping_method: "YES",
      num_of_item: String(input.itemCount),
      cus_name: input.contact.name.slice(0, 50),
      cus_email: input.contact.email,
      cus_add1: input.address.addressLine.slice(0, 50),
      cus_city: input.address.city.slice(0, 50),
      cus_postcode: input.address.postalCode.slice(0, 30),
      cus_country: input.address.country.slice(0, 50),
      cus_phone: input.address.phone.slice(0, 20),
      ship_name: input.address.fullName.slice(0, 50),
      ship_add1: input.address.addressLine.slice(0, 50),
      ship_city: input.address.city.slice(0, 50),
      ship_postcode: input.address.postalCode.slice(0, 50),
      ship_country: input.address.country.slice(0, 50),
    });

    let response: Response;
    try {
      response = await fetch(`${config.apiUrl}/gwprocess/v4/api.php`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
    } catch {
      throw new BadGatewayException("Could not connect to SSLCommerz to start checkout.");
    }
    if (!response.ok) {
      throw new BadGatewayException(`SSLCommerz could not start checkout (HTTP ${response.status}).`);
    }

    let gatewayResponse: unknown;
    try {
      gatewayResponse = await response.json();
    } catch {
      throw new BadGatewayException("SSLCommerz returned an invalid checkout response.");
    }
    if (!isRecord(gatewayResponse) || gatewayResponse.status !== "SUCCESS" ||
        typeof gatewayResponse.GatewayPageURL !== "string") {
      throw new BadGatewayException("SSLCommerz could not create a checkout session.");
    }

    let gatewayUrl: URL;
    try {
      gatewayUrl = new URL(gatewayResponse.GatewayPageURL);
    } catch {
      throw new BadGatewayException("SSLCommerz returned an invalid checkout URL.");
    }
    if (gatewayUrl.protocol !== "https:" ||
        gatewayUrl.hostname !== new URL(config.apiUrl).hostname || gatewayUrl.port) {
      throw new BadGatewayException("SSLCommerz returned an untrusted checkout URL.");
    }
    return gatewayUrl.toString();
  }

  async confirmPayment(callback: unknown): Promise<string> {
    if (!isRecord(callback) || typeof callback.tran_id !== "string" ||
        typeof callback.val_id !== "string" || !callback.tran_id || !callback.val_id) {
      throw new BadRequestException("SSLCommerz payment confirmation is incomplete.");
    }

    const payment = await this.prisma.payment.findUnique({
      where: { transactionId: callback.tran_id },
      include: { order: { select: { orderNumber: true, totalAmount: true } } },
    });
    if (!payment || payment.paymentMethod !== "SSLCOMMERZ") {
      throw new NotFoundException("Payment transaction not found.");
    }

    const config = this.getConfig();
    const validationUrl = new URL(`${config.apiUrl}/validator/api/validationserverAPI.php`);
    validationUrl.searchParams.set("val_id", callback.val_id);
    validationUrl.searchParams.set("store_id", config.storeId);
    validationUrl.searchParams.set("store_passwd", config.storePassword);
    validationUrl.searchParams.set("format", "json");

    let response: Response;
    try {
      response = await fetch(validationUrl);
    } catch {
      throw new BadGatewayException("Could not verify the payment with SSLCommerz.");
    }
    if (!response.ok) {
      throw new BadGatewayException(`SSLCommerz payment verification failed (HTTP ${response.status}).`);
    }

    let validation: unknown;
    try {
      validation = await response.json();
    } catch {
      throw new BadGatewayException("SSLCommerz returned an invalid payment verification response.");
    }
    if (!isRecord(validation)) {
      throw new BadRequestException("SSLCommerz could not verify this payment.");
    }
    const validatedAmount = String(validation.amount);
    if ((validation.status !== "VALID" && validation.status !== "VALIDATED") ||
        validation.tran_id !== payment.transactionId ||
        (typeof validation.amount !== "string" && typeof validation.amount !== "number") ||
        !/^\d+(?:\.\d{1,2})?$/.test(validatedAmount) ||
        validation.currency_type !== "BDT" ||
        String(validation.risk_level) !== "0" ||
        new Prisma.Decimal(validatedAmount).comparedTo(payment.amount) !== 0) {
      throw new BadRequestException("SSLCommerz could not verify this payment.");
    }

    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.payment.updateMany({
        where: { id: payment.id, paymentStatus: "PENDING" },
        data: { paymentStatus: "PAID", paidAt: new Date() },
      });
      if (updated.count === 0) return;
      await transaction.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: "PAID" },
      });
    });

    return payment.order.orderNumber;
  }

  async markUnsuccessful(callback: unknown, status: "FAILED" | "CANCELLED"): Promise<string> {
    if (!isRecord(callback) || typeof callback.tran_id !== "string" || !callback.tran_id) {
      throw new BadRequestException("SSLCommerz payment transaction is missing.");
    }
    const payment = await this.prisma.payment.findUnique({
      where: { transactionId: callback.tran_id },
      select: { id: true, orderId: true, paymentMethod: true, paymentStatus: true, order: { select: { orderNumber: true } } },
    });
    if (!payment || payment.paymentMethod !== "SSLCOMMERZ") {
      throw new NotFoundException("Payment transaction not found.");
    }

    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.payment.updateMany({
        where: { id: payment.id, paymentStatus: "PENDING" },
        data: { paymentStatus: status },
      });
      if (updated.count === 0) return;
      await transaction.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: status, orderStatus: "CANCELLED" },
      });
      await transaction.sellerOrder.updateMany({
        where: { orderId: payment.orderId, status: "PENDING" },
        data: { status: "CANCELLED" },
      });
      await releaseReservedStock(transaction, payment.orderId);
    });

    return payment.order.orderNumber;
  }

  getResultUrl(orderNumber: string, result: "success" | "failed" | "cancelled"): string {
    const { frontendUrl } = this.getConfig();
    const url = new URL("/payment/result", frontendUrl);
    url.searchParams.set("orderNumber", orderNumber);
    url.searchParams.set("result", result);
    return url.toString();
  }

  private getConfig(): GatewayConfig {
    const storeId = process.env.SSLCOMMERZ_STORE_ID?.trim();
    const storePassword = process.env.SSLCOMMERZ_STORE_PASSWORD;
    const isLive = process.env.SSLCOMMERZ_IS_LIVE;
    if (!storeId || !storePassword) {
      throw new InternalServerErrorException(
        "Online payments are not configured. Set SSLCOMMERZ_STORE_ID and SSLCOMMERZ_STORE_PASSWORD.",
      );
    }
    if (isLive !== "true" && isLive !== "false") {
      throw new InternalServerErrorException("Set SSLCOMMERZ_IS_LIVE to true or false.");
    }

    const backendUrl = this.parseBaseUrl("PUBLIC_BACKEND_URL", isLive === "true");
    const frontendUrl = this.parseBaseUrl("FRONTEND_URL", isLive === "true");
    const apiUrl = isLive === "true"
      ? "https://securepay.sslcommerz.com"
      : "https://sandbox.sslcommerz.com";
    return { storeId, storePassword, backendUrl, frontendUrl, apiUrl };
  }

  private parseBaseUrl(variable: string, requireHttps: boolean): string {
    const value = process.env[variable];
    if (!value) {
      throw new InternalServerErrorException(`${variable} must be configured for online payments.`);
    }
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new InternalServerErrorException(`${variable} must be a valid absolute URL.`);
    }
    if ((url.protocol !== "https:" && url.protocol !== "http:") ||
        url.username || url.password || url.search || url.hash) {
      throw new InternalServerErrorException(`${variable} must be an absolute HTTP(S) URL without credentials or query parameters.`);
    }
    if (requireHttps && url.protocol !== "https:") {
      throw new InternalServerErrorException(`${variable} must use HTTPS in live mode.`);
    }
    return url.origin;
  }
}
