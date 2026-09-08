import { describe, expect, it, vi } from "vitest";
import { NestUsersService } from "./users.service";

const sensitiveUser = {
    id: "user-1",
    email: "user@example.com",
    username: "user",
    role: "Customer",
    status: "Active",
    password: "hashed-password",
    token: "legacy-access-token",
    refresh_token: "legacy-refresh-token",
};

const expectPublicUser = (user: Record<string, unknown>) => {
    expect(user).toEqual(expect.objectContaining({ id: "user-1", email: "user@example.com" }));
    expect(user).not.toHaveProperty("password");
    expect(user).not.toHaveProperty("token");
    expect(user).not.toHaveProperty("refresh_token");
};

describe("users public response boundary", () => {
    it("sanitizes individual and admin-list user responses", async () => {
        const repository = {
            findById: vi.fn().mockResolvedValue(sensitiveUser),
            getAll: vi.fn().mockResolvedValue([sensitiveUser]),
            getPaginated: vi.fn().mockResolvedValue([sensitiveUser]),
        };
        const service = new NestUsersService(repository as never);

        expectPublicUser(await service.getUserById("user-1"));
        expectPublicUser((await service.getAllUsers())[0]);
        expectPublicUser((await service.getAllUsersPaginated(10, 0))[0]);
    });
});
