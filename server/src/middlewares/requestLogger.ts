import type { NextFunction, Request, Response } from "express";

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
    if (process.env.NODE_ENV !== "production") {
        console.log(`${req.method} request for '${req.url}'`);
    }
    next();
};

module.exports = requestLogger;
