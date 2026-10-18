const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "..", ".env") });

const mysql = require("mysql2/promise");
const { assertLocalDatabaseTarget } = require("../../config/database-target");

const ROUTING_ENDPOINT = "https://router.project-osrm.org";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEMO_SETTINGS = {
    storeAddress: "Digital-E demo pickup point, District 1, Ho Chi Minh City",
    storeLatitude: 10.7769,
    storeLongitude: 106.7009,
    fee5To20Vnd: 25000,
    feeOver20Vnd: 50000,
    routingEndpoint: ROUTING_ENDPOINT,
    tileUrl: TILE_URL,
    tileAttribution: "Map tiles © OpenStreetMap contributors · Routes © OSRM",
};

const isLoopback = (host) => ["localhost", "127.0.0.1", "::1"].includes(String(host || "").trim().toLowerCase());
const parseAllowlist = (value) => String(value || "").split(",").map((entry) => entry.trim()).filter(Boolean);

async function main() {
    if (process.env.NODE_ENV !== "development" || process.env.DB_NAME !== "digital_e_shop_local"
        || !isLoopback(process.env.DB_HOST)) {
        throw new Error("Local delivery settings seed only runs against the development digital_e_shop_local database on loopback.");
    }
    assertLocalDatabaseTarget({ dbHost: process.env.DB_HOST, databaseUrl: process.env.DATABASE_URL });

    if (!parseAllowlist(process.env.DELIVERY_ROUTING_ENDPOINT_ALLOWLIST).includes(ROUTING_ENDPOINT)
        || !parseAllowlist(process.env.DELIVERY_TILE_URL_ALLOWLIST).includes(TILE_URL)) {
        throw new Error("Add the local demo routing endpoint and HTTPS tile URL to the server allowlists before seeding.");
    }

    const pool = mysql.createPool({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
        waitForConnections: true,
        connectionLimit: 2,
        ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: true } : undefined,
    });
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();
        const [rows] = await connection.query(
            `SELECT store_address, store_latitude, store_longitude, fee_5_to_20_vnd, fee_over_20_vnd,
                    routing_endpoint, tile_url, tile_attribution, version
             FROM delivery_settings WHERE id = 1 FOR UPDATE`,
        );
        const current = rows[0];
        if (!current) throw new Error("Delivery settings migration is missing; apply local migrations first.");

        const currentValues = [current.store_address, current.store_latitude, current.store_longitude,
            current.fee_5_to_20_vnd, current.fee_over_20_vnd, current.routing_endpoint,
            current.tile_url, current.tile_attribution];
        const isEmpty = currentValues.every((value) => value == null) && Number(current.version) === 0;
        const alreadySeeded = current.store_address === DEMO_SETTINGS.storeAddress
            && Number(current.store_latitude) === DEMO_SETTINGS.storeLatitude
            && Number(current.store_longitude) === DEMO_SETTINGS.storeLongitude
            && Number(current.fee_5_to_20_vnd) === DEMO_SETTINGS.fee5To20Vnd
            && Number(current.fee_over_20_vnd) === DEMO_SETTINGS.feeOver20Vnd
            && current.routing_endpoint === DEMO_SETTINGS.routingEndpoint
            && current.tile_url === DEMO_SETTINGS.tileUrl
            && current.tile_attribution === DEMO_SETTINGS.tileAttribution;

        if (alreadySeeded) {
            await connection.commit();
            process.stdout.write("Local demo delivery settings are already seeded; no changes made.\n");
            return;
        }
        if (!isEmpty) throw new Error("Delivery settings already contain data; refusing to overwrite operator configuration.");

        await connection.query(
            `UPDATE delivery_settings
             SET store_address = ?, store_latitude = ?, store_longitude = ?, fee_5_to_20_vnd = ?, fee_over_20_vnd = ?,
                 routing_endpoint = ?, tile_url = ?, tile_attribution = ?, version = 1, updated_by_id = NULL,
                 updated_at = UTC_TIMESTAMP(3)
             WHERE id = 1 AND version = 0`,
            [DEMO_SETTINGS.storeAddress, DEMO_SETTINGS.storeLatitude, DEMO_SETTINGS.storeLongitude,
                DEMO_SETTINGS.fee5To20Vnd, DEMO_SETTINGS.feeOver20Vnd, DEMO_SETTINGS.routingEndpoint,
                DEMO_SETTINGS.tileUrl, DEMO_SETTINGS.tileAttribution],
        );
        await connection.commit();
        process.stdout.write("Seeded local demo delivery settings (fictional address and test-only routing).\n");
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
        await pool.end();
    }
}

if (require.main === module) {
    main().catch((error) => {
        process.stderr.write(`Local delivery settings seed failed: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 1;
    });
}

module.exports = { main, DEMO_SETTINGS };
