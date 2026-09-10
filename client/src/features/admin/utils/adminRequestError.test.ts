import { describe, expect, it } from "vitest";
import { getAdminRequestError } from "./adminRequestError";

describe("getAdminRequestError", () => {
    it.each([
        [{ response: { status: 401 } }, "auth"],
        [{ response: { status: 403 } }, "forbidden"],
        [{ response: { status: 500 } }, "unknown"],
        [{ request: {} }, "network"],
    ])("classifies %s as %s", (error, kind) => {
        expect(getAdminRequestError(error)).toMatchObject({ kind });
    });
});
