import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
    const app = await NestFactory.create(AppModule);
    // Matches server/src/app.ts's app.use(cookieParser()) - guards that read
    // req.cookies (e.g. AuthGuard) require this to be registered globally.
    app.use(cookieParser());
    const port = Number(process.env.NEST_SCAFFOLD_PORT || 4100);
    await app.listen(port);
    console.log(`Nest scaffolding phase listening on http://localhost:${port}`);
}

bootstrap();
