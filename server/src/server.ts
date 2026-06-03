import app from "#/app";
import { env } from "#/config/env.config";
import { logger } from "#/shared/utils/logger";

app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
});
