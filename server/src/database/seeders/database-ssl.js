const fs = require("node:fs");
const path = require("node:path");

const resolveDemoDatabaseSsl = () => {
    if (process.env.DB_SSL !== "true") {
        return undefined;
    }

    const caPath = process.env.DB_SSL_CA_PATH?.trim() || path.resolve(__dirname, "..", "ca.pem");

    return {
        ca: fs.readFileSync(caPath, "utf8"),
    };
};

module.exports = { resolveDemoDatabaseSsl };
