import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// `HTTPS=1 npm run dev` serves the dev UI over HTTPS (self-signed) so the
// microphone works when testing on a phone over the LAN. Not needed for
// localhost (already a secure context).
const useHttps = process.env.HTTPS === "1" || process.env.HTTPS === "true";

// The dev server runs on 8099 (the user-facing port) and proxies /api to the
// backend (which runs on 8090 in dev). In production the backend serves the
// built files directly. base "./" keeps assets relative so it works under the
// Home Assistant Ingress path prefix.
export default defineConfig({
  plugins: [react(), ...(useHttps ? [basicSsl()] : [])],
  base: "./",
  css: {
    postcss: {
      plugins: [
        tailwindcss({
          content: ["./index.html", "./src/**/*.{ts,tsx}"],
          theme: {
            extend: {
              colors: {
                ink: { 950: "#0a0c12", 900: "#0e1118", 800: "#161a24", 700: "#1f2533", 600: "#2b3242" },
                brand: { 400: "#7aa2ff", 500: "#5b8bff", 600: "#3f6fe6" },
              },
            },
          },
        }),
        autoprefixer(),
      ],
    },
  },
  server: {
    host: true, // bind 0.0.0.0 so a phone on the LAN can reach the dev server
    port: 8099,
    proxy: {
      // ws:true so the /api/realtime/ws voice socket is proxied too.
      "/api": { target: "http://localhost:8090", changeOrigin: true, ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
