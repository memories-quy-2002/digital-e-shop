import { env } from "#src/config/env.config";

export const getRouteLimit = (productionLimit = 100) =>
    env.nodeEnv === "production" || env.nodeEnv === "test" ? productionLimit : 10000;

