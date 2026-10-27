import { BadRequestException, Body, Controller, Get, Headers, Post, UnauthorizedException, UseGuards } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { AuthGuard } from "../guards/auth.guard";
import { RolesGuard, Roles } from "../guards/roles.guard";
import { TaskRunnerService } from "./task-runner.service";
import { taskRunnerInputSchema } from "./task-runner.validator";

export function authorizeRunnerSecret(authorization: string | undefined, secret: string | undefined): boolean {
    if (!authorization || !secret) return false;
    const expected = Buffer.from(`Bearer ${secret}`, "utf8");
    const actual = Buffer.from(authorization, "utf8");
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

@Controller()
export class TaskRunnerController {
    constructor(private readonly runner: TaskRunnerService) {}

    @Get("operations/run")
    async runScheduledCron(@Headers("authorization") authorization: string | undefined) {
        if (!authorizeRunnerSecret(authorization, process.env.CRON_SECRET)) throw new UnauthorizedException("Unauthorized");
        return this.runner.run({ limit: 20, budgetMs: 20000 });
    }

    @Post("operations/run")
    async runScheduled(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
        if (!authorizeRunnerSecret(authorization, process.env.OPERATIONS_RUNNER_SECRET)) throw new UnauthorizedException("Unauthorized");
        const input = taskRunnerInputSchema.safeParse(body ?? {});
        if (!input.success) throw new BadRequestException("Invalid runner request");
        return this.runner.run(input.data);
    }

    @Post("admin/operations/run")
    @UseGuards(AuthGuard, RolesGuard)
    @Roles("admin")
    async runAdmin(@Body() body: unknown) {
        const input = taskRunnerInputSchema.safeParse(body ?? {});
        if (!input.success) throw new BadRequestException("Invalid runner request");
        return this.runner.run(input.data);
    }
}
