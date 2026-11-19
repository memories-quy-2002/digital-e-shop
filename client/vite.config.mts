import { defineConfig, loadEnv, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientRoot = fileURLToPath(new URL('.', import.meta.url));
const bundleAnalysisEnabled = process.env.DIGITAL_E_BUNDLE_ANALYSIS === 'true';

export default defineConfig(async ({ mode }) => {
    const env = loadEnv(mode, clientRoot, 'VITE_');
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
                '/__local_api': {
                    target: (env.VITE_LOCAL_API_PROXY_TARGET || 'http://localhost:4000').replace(/\/+$/, ''),
                    changeOrigin: true,
                    rewrite: (requestPath) => requestPath.replace(/^\/__local_api/, ''),
                    configure: (proxy) => {
                        proxy.on('proxyReq', (proxyRequest) => {
                            proxyRequest.removeHeader('origin');
                        });
                        proxy.on('proxyRes', (proxyResponse) => {
                            const cookies = proxyResponse.headers['set-cookie'];
                            if (Array.isArray(cookies)) {
                                proxyResponse.headers['set-cookie'] = cookies.map((cookie) =>
                                    /;\s*Path=/i.test(cookie)
                                        ? cookie.replace(/;\s*Path=[^;]*/i, '; Path=/__local_api')
                                        : `${cookie}; Path=/__local_api`,
                                );
                            }
                        });
                    },
                },
                '/__production_api': {
                    target: (env.VITE_PRODUCTION_API_PROXY_TARGET || 'https://e-commerce-express-server-app.vercel.app').replace(/\/+$/, ''),
                    changeOrigin: true,
                    rewrite: (requestPath) => requestPath.replace(/^\/__production_api/, ''),
                    configure: (proxy) => {
                        proxy.on('proxyReq', (proxyRequest) => {
                            proxyRequest.removeHeader('origin');
                        });
                        proxy.on('proxyRes', (proxyResponse) => {
                            const cookies = proxyResponse.headers['set-cookie'];
                            if (Array.isArray(cookies)) {
                                proxyResponse.headers['set-cookie'] = cookies.map((cookie) =>
                                    /;\s*Path=/i.test(cookie)
                                        ? cookie.replace(/;\s*Path=[^;]*/i, '; Path=/__production_api')
                                        : `${cookie}; Path=/__production_api`,
                                );
                            }
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
