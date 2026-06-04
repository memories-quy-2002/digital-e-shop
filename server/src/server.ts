import app from "#src/app";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";

app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port}`);
});
