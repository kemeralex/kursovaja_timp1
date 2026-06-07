import { API_BASE, authHeaders } from "./config";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function handleUnauthorized() {
  localStorage.removeItem("token");
  window.location.assign("/login");
}

export async function apiFetch(path, options = {}, { retries = 0, retryDelayMs = 800 } = {}) {
  let lastError;
  let lastResponse;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
          ...authHeaders(),
          ...(options.headers || {}),
        },
      });

      if (res.status === 401) {
        handleUnauthorized();
        throw new Error("unauthorized");
      }

      if (res.status === 429) {
        lastResponse = res;
        if (attempt < retries) {
          await sleep(retryDelayMs * (attempt + 2));
          continue;
        }
        return res;
      }

      return res;
    } catch (err) {
      lastError = err;
      if (err?.message === "unauthorized") throw err;
      if (attempt < retries) await sleep(retryDelayMs * (attempt + 1));
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError;
}

export async function isServerReachable() {
  try {
    const res = await fetch(`${API_BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}
