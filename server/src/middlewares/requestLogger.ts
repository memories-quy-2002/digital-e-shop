import type { AppNextFunction, AppRequest, AppResponse } from "../types/domain";

const requestLogger = (req: AppRequest, res: AppResponse, next: AppNextFunction) => {
    if (process.env.NODE_ENV !== "production") {
        console.log(`${req.method} request for '${req.url}'`);
    }
    next();
};

module.exports = requestLogger;
