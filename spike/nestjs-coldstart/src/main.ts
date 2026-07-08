import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3999);
  console.log("Spike Nest app listening on http://localhost:3999");
}

bootstrap();
