import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { AuthController } from "./auth/auth.controller";
import { ProductController } from "./products/product.controller";
import { CartController } from "./cart/cart.controller";
import { AiController } from "./ai/ai.controller";
import { AiService } from "./ai/ai.service";
import { HealthController } from "./health.controller";
import { OrdersController } from "./orders/orders.controller";
import { SellerController } from "./seller/seller.controller";

@Module({
  controllers: [HealthController, AuthController, ProductController, CartController, AiController, OrdersController, SellerController],
  providers: [PrismaService, AiService],
})
export class AppModule {}

