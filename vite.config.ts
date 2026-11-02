import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vite configuration for English Learning Tool
 * @see https://vite.dev/config/
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Listen on all addresses (IPv4 too), so ngrok can reach 127.0.0.1
    host: true,
    // Dev server reached through an ngrok or Cloudflare tunnel (the subdomain changes per tunnel, the leading dot allows any)
    allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app', '.ngrok.app', '.trycloudflare.com'],
    proxy: {
      '/api': 'http://localhost:3002',
    },
  },
});
