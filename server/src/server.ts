import bootstrap from "#src/main";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";

async function start() {
    const app = await bootstrap();
    const instance = app.getHttpAdapter().getInstance();
    instance.listen(env.port, () => {
        logger.info(`Server running on port ${env.port}`);
    });
}

start();
