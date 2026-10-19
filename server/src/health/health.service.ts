import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";

const DATABASE_CHECK_TIMEOUT_MS = 1500;

@Injectable()
export class HealthService {
    async isDatabaseReady(): Promise<boolean> {
        return new Promise((resolve) => {
            let settled = false;
            const finish = (ready: boolean) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeout);
                resolve(ready);
            };

            // The outer timer also bounds pool-queue wait time; mysql2's query
            // timeout bounds execution after a connection becomes available.
            const timeout = setTimeout(() => finish(false), DATABASE_CHECK_TIMEOUT_MS);

            pool.query(
                { sql: "SELECT 1", timeout: DATABASE_CHECK_TIMEOUT_MS },
                (error: Error | null) => finish(!error),
            );
        });
    }
}
