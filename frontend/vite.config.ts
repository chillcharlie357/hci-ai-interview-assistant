import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, ".."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (_proxyReq, _req, _res) => {
            // Allow large video uploads (up to 200MB) through dev proxy.
            // _maxBodyLength is an undocumented internal property of node:http that
            // limits request body size (default ~10MB). This may break in future
            // Node.js/Vite versions; the alternative is to configure a reverse proxy
            // (e.g. nginx) with an appropriate client_max_body_size.
            if ("_maxBodyLength" in proxy) {
              (proxy as Record<string, unknown>)._maxBodyLength = 200 * 1024 * 1024;
            }
          });
        },
      },
    },
  },
});
