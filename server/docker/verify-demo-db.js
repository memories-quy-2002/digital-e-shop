const path = require("path");

require("dotenv").config({
    path: path.resolve(__dirname, "..", ".env.docker"),
    override: true,
});

process.env.DIGITAL_E_SEED_ENV_FILE = path.resolve(__dirname, "..", ".env.docker");

const { main } = require(path.resolve(__dirname, "..", "src", "database", "seeders", "verifyDemo.js"));

main().catch((error) => {
    console.error("Docker demo verification failed:", error instanceof Error ? error.code || error.errors?.[0]?.code || error.message || "unknown error" : String(error));
    process.exitCode = 1;
});
