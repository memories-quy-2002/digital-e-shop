import { Body, Controller, Get, HttpException, Param, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestUsersService } from "./users.service";
import { NestAuthService } from "../auth/auth.service";
import { adminUserUpdateSchema } from "./users.validator";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { USER_ROLE } from "#src/shared/constants/user";
import { createHttpException } from "#src/core/errors/http-exception";

function toHttpException(err: { statusCode?: number; message?: string }, fallbackMessage: string): HttpException {
    if (err instanceof HttpException) return err;
    const statusCode = err.statusCode || HTTP_STATUS.INTERNAL_SERVER_ERROR;
    const msg = statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR ? fallbackMessage : err.message || fallbackMessage;
    return createHttpException(err, { msg }, statusCode);
}

@Controller(["users", "user"])
@UseGuards(AuthGuard, RolesGuard)
export class UsersController {
    constructor(
        private readonly usersService: NestUsersService,
        private readonly authService: NestAuthService,
    ) {}

    @Get("me")
    async getCurrentUser(@Req() req: Request) {
        try {
            const accessToken = req.cookies?.accessToken;
            const sessionId = req.cookies?.session;
            const userData = await this.authService.getCurrentUser(accessToken, sessionId);
            return { userData };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to get current user");
        }
    }

    @Get(":id/profile")
    @Roles(USER_ROLE.ADMIN)
    async getCustomerProfile(@Param("id") id: string) {
        try {
            const profile = await this.usersService.getCustomerProfile(id);
            if (!profile) {
                throw new HttpException({ msg: "Customer not found" }, HTTP_STATUS.NOT_FOUND);
            }
            return { profile, msg: "Customer profile retrieved successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to get customer profile");
        }
    }

    @Get(":id")
    @OwnerParam("id")
    async getUserById(@Param("id") id: string) {
        try {
            const user = await this.usersService.getUserById(id);
            return { userData: user, msg: "User logged in successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to get user");
        }
    }

    @Get()
    @Roles(USER_ROLE.ADMIN)
    async getAllUsers(@Query() query: Record<string, unknown>) {
        try {
            const page = Number(query.page);
            const limit = Number(query.limit);
            const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
            const safeLimit = usePagination ? Math.min(limit, 100) : null;
            const offset = usePagination ? (page - 1) * safeLimit : 0;

            if (usePagination) {
                const [users, total] = await Promise.all([
                    this.usersService.getAllUsersPaginated(safeLimit as number, offset),
                    this.usersService.getUsersCount(),
                ]);

                return {
                    accounts: users,
                    pagination: {
                        page,
                        limit: safeLimit,
                        total,
                        totalPages: Math.ceil(total / safeLimit),
                    },
                    msg: "Get users successfully",
                };
            }

            const users = await this.usersService.getAllUsers();
            return { accounts: users, msg: "Get users successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to get users");
        }
    }

    @Put(":id")
    @Roles(USER_ROLE.ADMIN)
    async updateUserAdmin(
        @Param("id") id: string,
        @Body(new ZodValidationPipe(adminUserUpdateSchema)) body: { role: string; status: string },
    ) {
        try {
            const account = await this.usersService.updateUserAdmin(id, body);
            return { account, msg: "Account updated successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw toHttpException(err as Error, "Unable to update account");
        }
    }
}
