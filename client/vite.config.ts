import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: "/", // Ensure this is set correctly
    resolve: {
        alias: {
            "@": path.resolve(clientRoot, "src"),
        },
    },
    build: {
        outDir: "dist",
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (!id.includes("node_modules")) {
                        return undefined;
                    }

                    if (id.includes("recharts")) {
                        return "vendor-charts";
                    }

                    if (id.includes("firebase")) {
                        return "vendor-firebase";
                    }

                    if (id.includes("react-helmet")) {
                        return "vendor-helmet";
                    }

                    if (id.includes("@vercel/analytics") || id.includes("@vercel/speed-insights") || id.includes("web-vitals")) {
                        return "vendor-observability";
                    }

                    if (id.includes("react-router") || id.includes("@remix-run")) {
                        return "vendor-router";
                    }

                    if (id.includes("react-dom") || id.includes("react/jsx-runtime") || id.match(/[\\/]node_modules[\\/]react[\\/]/)) {
                        return "vendor-react";
                    }

                    return "vendor-misc";
                },
            },
        },
    },
});
