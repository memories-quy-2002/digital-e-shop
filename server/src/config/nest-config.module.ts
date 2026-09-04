import { Global, Module } from "@nestjs/common";
import { NestConfigService } from "./nest-config.service";

@Global()
@Module({
    providers: [NestConfigService],
    exports: [NestConfigService],
})
export class NestConfigModule {}
