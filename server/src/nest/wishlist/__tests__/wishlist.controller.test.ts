import { describe, expect, it, vi, beforeEach } from "vitest";
import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { WishlistModule } from "../wishlist.module";
import { WishlistController } from "../wishlist.controller";
import { NestWishlistService } from "../wishlist.service";

vi.mock("#src/modules/wishlist/wishlist.service", () => ({
    addItemToWishlist: vi.fn(),
    getWishlist: vi.fn(),
    deleteWishlistItem: vi.fn(),
    deleteWishlistItems: vi.fn(),
}));
// AuthGuard imports authService and usersRepository, both of which open a
// real MySQL pool at module load time via their repositories. Mock them so
// this controller test never touches the database.
vi.mock("#src/modules/auth/auth.service", () => ({
    authService: { verifySessionToken: vi.fn().mockResolvedValue({ valid: true }) },
}));
vi.mock("#src/modules/users/users.repository", () => ({
    usersRepository: { findById: vi.fn() },
}));

describe("WishlistController", () => {
    let controller: WishlistController;
    let service: NestWishlistService;

    beforeEach(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [WishlistModule],
        }).compile();

        controller = moduleRef.get(WishlistController);
        service = moduleRef.get(NestWishlistService);
    });

    it("module compiles with the guards, pipes, and rate-limit middleware wired without error", () => {
        expect(controller).toBeDefined();
    });

    it("getWishlist returns the existing controller's response shape", async () => {
        vi.spyOn(service, "getWishlist").mockResolvedValue([{ id: 1, product_id: 10 }] as never);

        const result = await controller.getWishlist("42");

        expect(service.getWishlist).toHaveBeenCalledWith("42");
        expect(result).toEqual({
            msg: "Get wishlist with user_id = 42 successfully",
            wishlist: [{ id: 1, product_id: 10 }],
        });
    });

    it("addItemToWishlist delegates to the service and returns { msg }", async () => {
        vi.spyOn(service, "addItemToWishlist").mockResolvedValue("added");

        const result = await controller.addItemToWishlist({ uid: "42", pid: 10 });

        expect(service.addItemToWishlist).toHaveBeenCalledWith("42", 10);
        expect(result).toEqual({ msg: "added" });
    });

    it("deleteWishlistItems delegates to the service and returns { msg }", async () => {
        vi.spyOn(service, "deleteWishlistItems").mockResolvedValue("deleted");

        const result = await controller.deleteWishlistItems({ uid: "42", productIds: [1, 2] });

        expect(service.deleteWishlistItems).toHaveBeenCalledWith("42", [1, 2]);
        expect(result).toEqual({ msg: "deleted" });
    });

    it("deleteWishlistItem validates uid/pid and delegates to the service", async () => {
        vi.spyOn(service, "deleteWishlistItem").mockResolvedValue("deleted item");

        const result = await controller.deleteWishlistItem("10", "42");

        expect(service.deleteWishlistItem).toHaveBeenCalledWith("42", 10);
        expect(result).toEqual({ msg: "deleted item" });
    });

    it("deleteWishlistItem rejects with the existing { msg } validation shape when uid is missing", async () => {
        await expect(controller.deleteWishlistItem("10", "")).rejects.toBeInstanceOf(BadRequestException);
    });
});
