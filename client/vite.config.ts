import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    base: "/", // Ensure this is set correctly
    build: {
        outDir: "dist",
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes("node_modules/react-icons")) {
                        return "react-icons";
                    }
                    return undefined;
                },
            },
        },
    },
    optimizeDeps: {
        include: ["react-icons/bs"],
    },
});
