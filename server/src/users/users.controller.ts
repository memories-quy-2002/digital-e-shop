import { Body, Controller, Get, HttpException, Param, Put, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { AuthGuard } from "../guards/auth.guard";
import { OwnerParam, Roles, RolesGuard } from "../guards/roles.guard";
import { ZodValidationPipe } from "../pipes/zod-validation.pipe";
import { NestUsersService } from "./users.service";
import { NestAuthService } from "../auth/auth.service";
import { adminUserUpdateSchema, adminUsersQuerySchema } from "./users.validator";
import { HTTP_STATUS } from "#src/shared/constants/http-status";
import { USER_ROLE } from "#src/shared/constants/user";
import { mapToHttpException } from "#src/core/errors/http-exception-mapper";

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
            throw mapToHttpException(err, "Unable to get current user");
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
            throw mapToHttpException(err, "Unable to get customer profile");
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
            throw mapToHttpException(err, "Unable to get user");
        }
    }

    @Get()
    @Roles(USER_ROLE.ADMIN)
    async getAllUsers(@Query(new ZodValidationPipe(adminUsersQuerySchema)) query: {
        page: number;
        limit: number;
        search: string;
        role?: string;
        status?: string;
    }) {
        try {
            const filters = { search: query.search, role: query.role, status: query.status };
            const [total, summary] = await Promise.all([
                this.usersService.getUsersCount(filters),
                this.usersService.getAdminSummary(),
            ]);
            const totalPages = Math.ceil(total / query.limit);
            const page = Math.min(query.page, Math.max(totalPages, 1));
            const offset = (page - 1) * query.limit;
            const users = await this.usersService.getAllUsersPaginated(query.limit, offset, filters);
            return {
                accounts: users,
                summary,
                pagination: { page, limit: query.limit, total, totalPages },
                msg: "Get users successfully",
            };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw mapToHttpException(err, "Unable to get users");
        }
    }

    @Put(":id")
    @Roles(USER_ROLE.ADMIN)
    async updateUserAdmin(
        @Param("id") id: string,
        @Req() req: Request & { user?: { id?: string | number } },
        @Body(new ZodValidationPipe(adminUserUpdateSchema)) body: { role: string; status: string; reason: string },
    ) {
        try {
            const account = await this.usersService.updateUserAdmin(id, body, String(req.user?.id || ""));
            return { account, msg: "Account updated successfully" };
        } catch (err) {
            if (err instanceof HttpException) throw err;
            throw mapToHttpException(err, "Unable to update account");
        }
    }
}
