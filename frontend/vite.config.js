import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Страницы React (/chats, /chats/:id) совпадают с API-путями — при F5 отдаём SPA, не бэкенд. */
function apiProxy() {
  return {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
    bypass(req) {
      if (req.headers.accept?.includes("text/html")) {
        return "/index.html";
      }
    },
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/users": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/chats": apiProxy(),
      "/messages": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/upload": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/uploads": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/health": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/ws": { target: "ws://127.0.0.1:8000", ws: true, changeOrigin: true },
    },
  },
});
