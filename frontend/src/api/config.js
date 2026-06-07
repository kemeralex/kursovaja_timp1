// В dev запросы идут через proxy Vite (пустой base = тот же хост :5173 → :8000)
// В production или Docker задайте VITE_API_URL=http://localhost:8000
export const API_BASE = import.meta.env.VITE_API_URL ?? "";

function wsOrigin() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (import.meta.env.DEV) {
    // Напрямую к backend — без Vite WS proxy (иначе ECONNABORTED при переподключениях)
    return "ws://127.0.0.1:8000";
  }
  if (API_BASE) return API_BASE.replace(/^http/, "ws");
  return "ws://127.0.0.1:8000";
}

export const WS_BASE = wsOrigin();

export function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function fileUrl(path) {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return API_BASE ? `${API_BASE}${path}` : path;
}
