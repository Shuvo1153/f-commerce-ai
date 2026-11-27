import { Controller, Get } from "@nestjs/common";

@Controller()
export class HealthController {
  @Get()
  root() {
    return {
      status: "ok",
      service: "F-Commerce API",
      message: "The F-Commerce API is running.",
    };
  }

  @Get("health")
  health() {
    return { status: "ok", service: "F-Commerce API" };
  }
}
