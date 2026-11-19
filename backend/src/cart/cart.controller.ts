import { Controller, Delete, Get, Param, Patch, Post, Body } from "@nestjs/common";

@Controller("cart")
export class CartController {
  @Get()
  cart() {
    return { id: "demo-cart", items: [], subtotal: 0 };
  }

  @Post("items")
  add(@Body() body: { productId: string; quantity?: number }) {
    return { success: true, productId: body.productId, quantity: body.quantity || 1 };
  }

  @Patch("items/:id")
  update(@Param("id") id: string, @Body() body: { quantity: number }) {
    return { success: true, itemId: id, quantity: body.quantity };
  }

  @Delete("items/:id")
  remove(@Param("id") id: string) {
    return { success: true, itemId: id };
  }
}
