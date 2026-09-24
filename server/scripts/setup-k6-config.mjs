import { copyFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
);
const templatePath = path.join(serverDirectory, ".env.k6.example");
const configPath = path.join(serverDirectory, ".env.k6");

try {
    await copyFile(templatePath, configPath, constants.COPYFILE_EXCL);
    console.log("Created server/.env.k6. Edit it to configure your k6 runs.");
} catch (error) {
    if (error.code === "EEXIST") {
        console.log("server/.env.k6 already exists; it was left unchanged.");
    } else {
        console.error(`Could not create server/.env.k6: ${error.message}`);
        process.exitCode = 1;
    }
}
