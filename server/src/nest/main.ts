import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    const port = Number(process.env.NEST_SCAFFOLD_PORT || 4100);
    await app.listen(port);
    console.log(`Nest scaffolding phase listening on http://localhost:${port}`);
}

bootstrap();
