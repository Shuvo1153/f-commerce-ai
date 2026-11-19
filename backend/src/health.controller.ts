import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get()
  root() {
    return {
      status: "ok",
      service: "F-Commerce API",
      message: "The API is running. Open the storefront at http://localhost:3000.",
    };
  }

  @Get("health")
  health() {
    return { status: "ok", service: "F-Commerce API" };
  }
}
