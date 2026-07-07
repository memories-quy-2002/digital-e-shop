import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 configuration. Connection URLs and CLI settings live here now
// (they were removed from schema.prisma and the deprecated package.json#prisma
// block in Prisma 7). The `url` below is used by the Prisma CLI for tasks such
// as `prisma db pull`/`prisma migrate`; the runtime client gets its connection
// via the MariaDB driver adapter in src/database/prisma/client.ts.
export default defineConfig({
    schema: "src/database/prisma/schema.prisma",
    datasource: {
        url: env("DATABASE_URL"),
    },
});
