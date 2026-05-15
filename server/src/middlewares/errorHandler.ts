import type { Request, Response } from "express";

const errorHandler = (err: Error & { code?: string }, req: Request, res: Response) => {
    // Keep CSRF failures explicit so the Axios client can refresh the token and
    // retry once without treating the response as a generic server error.
    if (err && err.code === "EBADCSRFTOKEN") {
        return res.status(403).json({ error: "Invalid CSRF token" });
    }
    console.error(err.stack || err);
    res.status(500).json({ error: "Something broke!" });
};

module.exports = errorHandler;
