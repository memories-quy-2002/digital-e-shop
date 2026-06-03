const { PrismaClient } = require("@prisma/client");

declare global {
    var __prisma: InstanceType<typeof PrismaClient> | undefined;
}

const prisma: InstanceType<typeof PrismaClient> =
    global.__prisma ??
    new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });

if (process.env.NODE_ENV !== "production") {
    global.__prisma = prisma;
}

export = prisma;
