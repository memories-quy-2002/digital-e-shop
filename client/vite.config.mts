import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));
const bundleAnalysisEnabled = process.env.DIGITAL_E_BUNDLE_ANALYSIS === "true";

export default defineConfig(async () => {
    const plugins: PluginOption[] = [react(), tailwindcss()];

    if (bundleAnalysisEnabled) {
        const { visualizer } = await import("rollup-plugin-visualizer");
        plugins.push(
            visualizer({
                filename: path.resolve(clientRoot, "node_modules/.cache/digital-e-bundle-analysis.html"),
                template: "treemap",
                gzipSize: true,
                brotliSize: true,
                open: false,
                projectRoot: clientRoot,
            }) as PluginOption,
        );
    }

    return {
        plugins,
        base: "/", // Ensure this is set correctly
        cacheDir: ".vite",
        resolve: {
            alias: {
                "@": path.resolve(clientRoot, "src"),
            },
        },
        build: {
            outDir: "dist",
            manifest: true,
        },
    };
});
