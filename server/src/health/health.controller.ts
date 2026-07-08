import { Controller, Get } from "@nestjs/common";

@Controller("health")
export class HealthController {
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
}
