import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7 configuration. Connection URLs and CLI settings live here now
// (they were removed from schema.prisma and the deprecated package.json#prisma
// block in Prisma 7). The `url` below is used by the Prisma CLI for tasks such
// as `prisma db pull`/`prisma migrate`; the runtime client gets its connection
// via the MariaDB driver adapter in src/database/prisma/client.ts.
//
// `env()` throws PrismaConfigEnvError when DATABASE_URL is unset, which
// breaks `prisma generate` (run from postinstall) on hosts like Vercel
// where install-time env vars aren't configured. `generate` only reads the
// schema and doesn't open a connection, so fall back to a placeholder —
// commands that do connect (db pull/migrate) will fail with Prisma's own
// connection error if DATABASE_URL is genuinely missing at that point.
export default defineConfig({
    schema: "src/database/prisma/schema.prisma",
    datasource: {
        url: process.env.DATABASE_URL || "mysql://user:password@localhost:3306/placeholder",
    },
});
