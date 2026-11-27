import "reflect-metadata";
import { RequestMethod } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.setGlobalPrefix("api/v1", {
    exclude: [{ path: "/", method: RequestMethod.GET }],
  });
  const port = Number(process.env.PORT || 3001);
  await app.listen(port, "0.0.0.0");
  console.log(`F-Commerce API listening on port ${port}`);
}
bootstrap();

