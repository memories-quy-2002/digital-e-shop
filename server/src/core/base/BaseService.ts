import { NotFoundError } from "#/core/errors/NotFoundError";

export class BaseService {
    protected ensureFound<T>(value: T | null | undefined, message: string): T {
        if (value === null || value === undefined) {
            throw new NotFoundError(message);
        }

        return value;
    }
}
