import { describe, expect, it } from "vitest";

const { quoteIdentifier, sanitizeDump } = require("./resetDemoDatabase.js");

describe("demo database reset helpers", () => {
    it("escapes SQL identifiers", () => {
        expect(quoteIdentifier("orders")).toBe("`orders`");
        expect(quoteIdentifier("table`name")).toBe("`table``name`");
    });

    it("rejects empty SQL identifiers", () => {
        expect(() => quoteIdentifier("")).toThrow("non-empty string");
    });

    it("removes provider-specific binary-log and GTID statements", () => {
        const dump = [
            "SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;",
            "SET @@SESSION.SQL_LOG_BIN= 0;",
            "SET @@GLOBAL.GTID_PURGED='example';",
            "CREATE TABLE `products` (id INT);",
            "SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;",
        ].join("\n");

        const sanitized = sanitizeDump(dump);

        expect(sanitized).not.toContain("GTID_PURGED");
        expect(sanitized).not.toContain("SQL_LOG_BIN");
        expect(sanitized).toContain("CREATE TABLE `products`");
    });
});
