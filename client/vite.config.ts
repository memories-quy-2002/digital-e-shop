import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const clientRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    plugins: [react(), tailwindcss()],
    base: "/", // Ensure this is set correctly
    cacheDir: ".vite",
    resolve: {
        alias: {
            "@": path.resolve(clientRoot, "src"),
        },
    },
    build: {
        outDir: "dist",
    },
});
