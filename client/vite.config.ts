import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local `vite dev`, proxy API + socket traffic to the backend.
// In production the nginx container handles this instead.
export default defineConfig({
  plugins: [react()],
  // Packaged Electron builds load index.html from file://, so assets must be
  // relative. The browser deployment keeps the normal root-relative paths.
  base: process.env.VITE_DESKTOP === "true" ? "./" : "/",
  server: {
    // Bind to all interfaces so phones and other devices on the LAN can
    // reach the Vite dev server.
    host: true,
    // The default is for a locally running API. When the API remains in
    // Docker, set ECHO_API_PROXY_TARGET to the server container's address.
    proxy: {
      "/api": {
        target: process.env.ECHO_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: process.env.ECHO_API_PROXY_TARGET || "http://localhost:4000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
