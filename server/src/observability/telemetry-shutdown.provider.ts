import { Injectable } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { shutdownTelemetry } from "./telemetry";

@Injectable()
export class TelemetryShutdownProvider implements OnApplicationShutdown {
    onApplicationShutdown() {
        return shutdownTelemetry();
    }
}
