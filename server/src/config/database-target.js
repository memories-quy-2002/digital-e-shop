const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const normalizeHost = (host) => String(host || "").trim().toLowerCase().replace(/^\[|\]$/g, "");

const getDatabaseUrlHost = (databaseUrl) => {
    if (!String(databaseUrl || "").trim()) {
        return { host: "", invalid: false };
    }

    try {
        return { host: normalizeHost(new URL(databaseUrl).hostname), invalid: false };
    } catch {
        return { host: "", invalid: true };
    }
};

const inspectDatabaseTarget = ({ dbHost, databaseUrl } = {}) => {
    const urlTarget = getDatabaseUrlHost(databaseUrl);

    return {
        hosts: [normalizeHost(dbHost), urlTarget.host].filter(Boolean),
        invalidUrl: urlTarget.invalid,
    };
};

const hasRemoteHost = (hosts) => hosts.some((host) => !LOCAL_DATABASE_HOSTS.has(host));

const nonLocalTargetError = () =>
    new Error(
        "Refusing to use a non-local database target outside production. Set DB_HOST and DATABASE_URL to localhost, 127.0.0.1, or ::1.",
    );

/**
 * Prisma generate only reads the schema and does not connect to a database.
 * Keep it usable during dependency installation on Vercel, where the runtime
 * database target must not be exposed to a build process.
 * @param {string[]} [argv]
 */
function isPrismaGenerateCommand(argv = process.argv) {
    return argv.includes("generate");
}

/**
 * @typedef {object} DatabaseTargetOptions
 * @property {string} [nodeEnv]
 * @property {string} [dbHost]
 * @property {string} [databaseUrl]
 */

/**
 * Protects runtime and Prisma CLI entrypoints from using a remote database
 * while running in development or test mode. Production is configured through
 * the deployment environment and is intentionally allowed to use a remote DB.
 * @param {DatabaseTargetOptions} options
 */
function assertSafeDatabaseTarget({ nodeEnv = "development", dbHost, databaseUrl } = {}) {
    if (nodeEnv === "production") {
        return;
    }

    const { hosts, invalidUrl } = inspectDatabaseTarget({ dbHost, databaseUrl });

    if (invalidUrl || hasRemoteHost(hosts)) {
        throw nonLocalTargetError();
    }
}

/**
 * Protects mock/demo seed commands, which are never intended to mutate a
 * production database regardless of NODE_ENV.
 * @param {DatabaseTargetOptions} options
 */
function assertLocalDatabaseTarget({ dbHost, databaseUrl } = {}) {
    const { hosts, invalidUrl } = inspectDatabaseTarget({ dbHost, databaseUrl });

    if (invalidUrl || hosts.length === 0) {
        throw new Error(
            "Local database target is not configured. Set DB_HOST and DATABASE_URL to a local database before seeding.",
        );
    }

    if (hasRemoteHost(hosts)) {
        throw nonLocalTargetError();
    }
}

module.exports = {
    assertLocalDatabaseTarget,
    assertSafeDatabaseTarget,
    isPrismaGenerateCommand,
};
