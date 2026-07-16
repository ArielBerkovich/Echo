import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During local `vite dev`, proxy API + socket traffic to the backend.
// In production the nginx container handles this instead.
export default defineConfig({
  plugins: [react()],
  server: {
    // The default is for a locally running API. When the API remains in
    // Docker, set ECHO_API_PROXY_TARGET to the server container's address.
    proxy: {
      "/api": process.env.ECHO_API_PROXY_TARGET || "http://localhost:4000",
      "/socket.io": {
        target: process.env.ECHO_API_PROXY_TARGET || "http://localhost:4000",
        ws: true,
      },
    },
  },
});
