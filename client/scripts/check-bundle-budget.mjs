import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const clientRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(clientRoot, "dist");
const manifestPath = path.join(outputDirectory, ".vite", "manifest.json");
const baselinePath = path.join(clientRoot, "bundle-size-baseline.json");

if (!fs.existsSync(manifestPath)) {
    console.error(`[bundle] Missing Vite manifest: ${manifestPath}`);
    process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const { maxGrowthPercent, baselines } = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const manifestEntries = Object.entries(manifest);

const normalize = (value) => value.replaceAll("\\", "/");

const findSourceKey = (sourcePath) => {
    const normalizedSourcePath = normalize(sourcePath);
    const matches = manifestEntries.filter(([key, chunk]) => {
        const normalizedKey = normalize(key);
        const normalizedSource = typeof chunk.src === "string" ? normalize(chunk.src) : "";
        return normalizedKey === normalizedSourcePath || normalizedKey.endsWith(`/${normalizedSourcePath}`)
            || normalizedSource === normalizedSourcePath || normalizedSource.endsWith(`/${normalizedSourcePath}`);
    });

    if (matches.length !== 1) {
        throw new Error(
            `Expected one manifest entry for ${sourcePath}, found ${matches.length}: ${matches.map(([key]) => key).join(", ")}`,
        );
    }

    return matches[0][0];
};

const indexEntry = manifest["index.html"]
    ? "index.html"
    : manifestEntries.find(([, chunk]) => chunk.isEntry && chunk.src === "index.html")?.[0];

if (!indexEntry) {
    throw new Error("Could not find the index.html entry in the Vite manifest.");
}

const sourceKeys = {
    home: findSourceKey("src/pages/HomePage.tsx"),
    product: findSourceKey("src/features/products/pages/ProductPage.tsx"),
    adminDashboard: findSourceKey("src/features/admin/pages/AdminDashboard.tsx"),
    adminDashboardCharts: findSourceKey("src/features/admin/components/AdminDashboardCharts.tsx"),
};

const staticGraphFiles = (rootKeys) => {
    const visitedKeys = new Set();
    const files = new Set();

    const visit = (key) => {
        if (visitedKeys.has(key)) return;

        const chunk = manifest[key];
        if (!chunk) {
            throw new Error(`Vite manifest dependency is missing: ${key}`);
        }

        visitedKeys.add(key);
        if (typeof chunk.file === "string" && chunk.file.endsWith(".js")) {
            files.add(chunk.file);
        }

        (chunk.imports ?? []).forEach(visit);
    };

    rootKeys.forEach(visit);
    return files;
};

const measureFiles = (files) => {
    let rawBytes = 0;
    let gzipBytes = 0;

    files.forEach((file) => {
        const absolutePath = path.resolve(outputDirectory, file);
        const relativePath = path.relative(outputDirectory, absolutePath);
        if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
            throw new Error(`Refusing to measure a file outside dist: ${file}`);
        }

        const contents = fs.readFileSync(absolutePath);
        rawBytes += contents.byteLength;
        gzipBytes += gzipSync(contents, { level: 9 }).byteLength;
    });

    return { rawBytes, gzipBytes };
};

const allJavaScriptFiles = new Set(
    manifestEntries
        .map(([, chunk]) => chunk.file)
        .filter((file) => typeof file === "string" && file.endsWith(".js")),
);

const largestChunkRawBytes = Math.max(
    ...[...allJavaScriptFiles].map((file) => fs.statSync(path.resolve(outputDirectory, file)).size),
);

const metrics = {
    sharedShellGzipBytes: measureFiles(staticGraphFiles([indexEntry])).gzipBytes,
    homeRouteGzipBytes: measureFiles(staticGraphFiles([indexEntry, sourceKeys.home])).gzipBytes,
    productRouteGzipBytes: measureFiles(staticGraphFiles([indexEntry, sourceKeys.product])).gzipBytes,
    adminDashboardRouteGzipBytes: measureFiles(
        staticGraphFiles([indexEntry, sourceKeys.adminDashboard, sourceKeys.adminDashboardCharts]),
    ).gzipBytes,
    adminDashboardChartsChunkGzipBytes: measureFiles(
        new Set([manifest[sourceKeys.adminDashboardCharts].file]),
    ).gzipBytes,
    allProductionJavaScriptGzipBytes: measureFiles(allJavaScriptFiles).gzipBytes,
    largestChunkRawBytes,
};

const formatBytes = (bytes) => `${(bytes / 1000).toFixed(2)} kB (${bytes} bytes)`;
let failed = false;

Object.entries(metrics).forEach(([name, actualBytes]) => {
    const baselineBytes = baselines[name];
    if (typeof baselineBytes !== "number" || baselineBytes <= 0) {
        throw new Error(`Bundle baseline is missing or invalid for ${name}.`);
    }

    const maximumBytes = Math.ceil(baselineBytes * (1 + maxGrowthPercent / 100));
    const passes = actualBytes <= maximumBytes;
    console.info(
        `[bundle] ${name}: ${formatBytes(actualBytes)}; baseline ${formatBytes(baselineBytes)}; limit ${formatBytes(maximumBytes)} (${passes ? "pass" : "exceeded"})`,
    );

    if (!passes) failed = true;
});

if (failed) {
    console.error(`[bundle] One or more bundle measurements exceeded the ${maxGrowthPercent}% growth allowance.`);
    process.exit(1);
}
