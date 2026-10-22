import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const bundleAnalysisEnabled = process.env.DIGITAL_E_BUNDLE_ANALYSIS === 'true';

export default defineConfig(async () => {
    const plugins: PluginOption[] = [react(), tailwindcss()];

    if (bundleAnalysisEnabled) {
        const { visualizer } = await import('rollup-plugin-visualizer');
        plugins.push(
            visualizer({
                filename: path.resolve(clientRoot, 'node_modules/.cache/digital-e-bundle-analysis.html'),
                template: 'treemap',
                gzipSize: true,
                brotliSize: true,
                open: false,
                projectRoot: clientRoot,
            }) as PluginOption,
        );
    }

    return {
        plugins,
        base: '/', // Ensure this is set correctly
        cacheDir: '.vite',
        server: {
            allowedHosts: ['equation-pushiness-expire.ngrok-free.dev'],
            proxy: {
                '/api': {
                    target: 'http://localhost:4000',
                    changeOrigin: true,
                    configure: (proxy: { on: (arg0: string, arg1: (proxyRequest: any) => void) => void }) => {
                        proxy.on('proxyReq', (proxyRequest) => {
                            proxyRequest.removeHeader('origin');
                        });
                    },
                },
            },
        },
        resolve: {
            alias: {
                '@': path.resolve(clientRoot, 'src'),
            },
        },
        build: {
            outDir: 'dist',
            manifest: true,
        },
    };
});
