import { env } from "#/config/env.config";

export const getRouteLimit = (productionLimit = 100) => (env.nodeEnv === "production" ? productionLimit : 10000);
