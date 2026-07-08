import { Injectable } from "@nestjs/common";
import { env, isProduction } from "#src/config/env.config";

@Injectable()
export class NestConfigService {
    get<K extends keyof typeof env>(key: K): (typeof env)[K] {
        return env[key];
    }

    get isProduction(): boolean {
        return isProduction;
    }
}
