// Copies non-TypeScript runtime assets into dist/ after `tsc`.
// tsc only emits compiled .js; assets that the compiled code reads at runtime
// (relative to __dirname) must be copied manually or they are missing from dist.
//
// Cross-platform by design: uses Node's fs API so it behaves identically on the
// local Windows shell (cmd.exe) and Vercel's Linux build containers.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// [source, destination] pairs, relative to the server package root.
// Destinations mirror the tsc layout (rootDir ".", outDir "dist"), so a file at
// src/foo/bar.json compiles alongside dist/src/foo/bar.json.
const assets = [
    ["src/docs/openapi.json", "dist/src/docs/openapi.json"],
    ["src/database/ca.pem", "dist/src/database/ca.pem"],
];

for (const [from, to] of assets) {
    const src = join(serverRoot, from);
    const dest = join(serverRoot, to);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
    console.log(`copied ${from} -> ${to}`);
}
