import type { Response } from "express";
import { HTTP_STATUS } from "#/shared/constants/httpStatus";
import type { PaginationMeta } from "#/shared/interfaces/Pagination";

const mergePayload = (data?: unknown, message?: string) => {
    if (data && typeof data === "object" && !Array.isArray(data)) {
        return message ? { ...(data as Record<string, unknown>), msg: message } : data;
    }

    if (data === undefined) {
        return message ? { msg: message } : {};
    }

    return message ? { data, msg: message } : { data };
};

export class BaseController {
    protected ok(res: Response, data?: unknown, message?: string) {
        return res.status(HTTP_STATUS.OK).json(mergePayload(data, message));
    }

    protected created(res: Response, data?: unknown, message?: string) {
        return res.status(HTTP_STATUS.CREATED).json(mergePayload(data, message));
    }

    protected noContent(res: Response) {
        return res.status(HTTP_STATUS.NO_CONTENT).send();
    }

    protected paginated(res: Response, items: unknown[], meta: PaginationMeta, message?: string) {
        return res.status(HTTP_STATUS.OK).json({
            items,
            pagination: meta,
            ...(message ? { msg: message } : {}),
        });
    }
}
