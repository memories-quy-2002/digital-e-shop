import type { Request, Response } from "express";
import { BaseController } from "#src/core/base/BaseController";
import { asyncHandler } from "#src/core/middlewares/asyncHandler";
import { authService } from "#src/modules/auth/auth.service";
import { usersService } from "./users.service";

class UsersController extends BaseController {
    getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
        const accessToken = req.cookies.accessToken;
        const sessionId = req.cookies.session;
        const userData = await authService.getCurrentUser(accessToken, sessionId);

        return res.status(200).json({ userData });
    });

    getUserById = asyncHandler(async (req: Request, res: Response) => {
        const user = await usersService.getUserById(String(req.params.id));
        return res.status(200).json({ userData: user, msg: "User logged in successfully" });
    });

    getAllUsers = asyncHandler(async (req: Request, res: Response) => {
        const page = Number(req.query.page);
        const limit = Number(req.query.limit);
        const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
        const safeLimit = usePagination ? Math.min(limit, 100) : null;
        const offset = usePagination ? (page - 1) * safeLimit : 0;

        if (usePagination) {
            const [users, total] = await Promise.all([
                usersService.getAllUsersPaginated(safeLimit, offset),
                usersService.getUsersCount(),
            ]);

            return res.status(200).json({
                accounts: users,
                pagination: {
                    page,
                    limit: safeLimit,
                    total,
                    totalPages: Math.ceil(total / safeLimit),
                },
                msg: "Get users successfully",
            });
        }

        const users = await usersService.getAllUsers();
        return res.status(200).json({ accounts: users, msg: "Get users successfully" });
    });

    updateUserAdmin = asyncHandler(async (req: Request, res: Response) => {
        const account = await usersService.updateUserAdmin(String(req.params.id), req.body);
        return res.status(200).json({ account, msg: "Account updated successfully" });
    });

    getCustomerProfile = asyncHandler(async (req: Request, res: Response) => {
        const profile = await usersService.getCustomerProfile(String(req.params.id));
        if (!profile) {
            return res.status(404).json({ msg: "Customer not found" });
        }

        return res.status(200).json({ profile, msg: "Customer profile retrieved successfully" });
    });
}

export const usersController = new UsersController();

