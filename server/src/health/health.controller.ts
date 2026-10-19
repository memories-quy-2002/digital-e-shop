import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    getHealth(): { status: string; timestamp: string } {
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
        };
    }

    @Get()
    handleGet(): { status: string; timestamp: string } {
        return this.getHealth();
    }

    @Get("live")
    handleLiveness(): { status: string; timestamp: string } {
        return this.getHealth();
    }

    @Get("ready")
    async handleReadiness(): Promise<{
        status: string;
        timestamp: string;
        checks: { database: string };
    }> {
        if (!(await this.healthService.isDatabaseReady())) {
            throw new ServiceUnavailableException({
                status: "error",
                timestamp: new Date().toISOString(),
                checks: { database: "unavailable" },
            });
        }

        return {
            status: "ok",
            timestamp: new Date().toISOString(),
            checks: { database: "ok" },
        };
    }
}
