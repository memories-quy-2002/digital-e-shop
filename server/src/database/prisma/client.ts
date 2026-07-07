import { PrismaClient } from "#src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

declare global {
    var __prisma: PrismaClient | undefined;
}

// Prisma 7 no longer reads the connection URL from schema.prisma; the runtime
// client connects through a driver adapter. PrismaMariaDb speaks the MySQL
// protocol, so it serves this MySQL database.
const adapter = new PrismaMariaDb(process.env.DATABASE_URL ?? "");

const prisma: PrismaClient =
    global.__prisma ??
    new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    global.__prisma = prisma;
}

export = prisma;
