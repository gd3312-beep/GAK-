export type SessionUser = {
  userId: string;
  fullName: string;
  email: string;
  profileImageUrl?: string | null;
};

const TOKEN_KEY = "gak_token";
const USER_KEY = "gak_user";

function resolveApiBase(): string {
  const configured = String(import.meta.env.VITE_API_URL || "").trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  if (typeof window !== "undefined") {
    // Keep dev onboarding friction low by defaulting API host to current hostname.
    // In production, VITE_API_URL should always be set explicitly.
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const runtimeHost = window.location.hostname || "localhost";
    const hostname = runtimeHost === "localhost" ? "127.0.0.1" : runtimeHost;
    const port = String(import.meta.env.VITE_API_PORT || "4000");
    return `${protocol}//${hostname}:${port}`;
  }

  return "http://localhost:4000";
}

const API_BASE = resolveApiBase();

export function getApiBaseUrl(): string {
  return API_BASE;
}

let cachedUserRaw: string | null = null;
let cachedUser: SessionUser | null = null;

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  const raw = localStorage.getItem(USER_KEY);

  if (raw === cachedUserRaw) {
    return cachedUser;
  }

  cachedUserRaw = raw;

  if (!raw) {
    cachedUser = null;
    return null;
  }

  try {
    cachedUser = JSON.parse(raw) as SessionUser;
    return cachedUser;
  } catch {
    cachedUser = null;
    return null;
  }
}

export function setSession(token: string, user: SessionUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  cachedUserRaw = JSON.stringify(user);
  cachedUser = user;
}

export function updateSessionUser(partial: Partial<SessionUser>): void {
  const current = getSessionUser();
  if (!current) return;
  const next: SessionUser = { ...current, ...partial };
  localStorage.setItem(USER_KEY, JSON.stringify(next));
  cachedUserRaw = JSON.stringify(next);
  cachedUser = next;
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  cachedUserRaw = null;
  cachedUser = null;
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  cache?: RequestCache;
  timeoutMs?: number;
};

export async function apiRequest<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, cache, timeoutMs } = options;

  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers["Content-Type"] = "application/json";
  }

  if (auth) {
    const token = getToken();
    if (!token) {
      throw new Error("Not authenticated");
    }

    headers.Authorization = `Bearer ${token}`;
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = Number(timeoutMs || 0);
  const timer = controller && timeout > 0
    ? globalThis.setTimeout(() => controller.abort(), timeout)
    : null;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      cache,
      signal: controller?.signal,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body)
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    if (timer !== null) {
      globalThis.clearTimeout(timer);
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message: string }).message)
        : `Request failed: ${response.status}`;

    const sessionInvalid =
      auth
      && (response.status === 401
        || (response.status === 404 && path === "/api/users/me" && message.toLowerCase().includes("user not found")));

    if (sessionInvalid) {
      clearSession();
      if (typeof window !== "undefined") {
        window.location.assign("/auth?mode=signin");
      }
      throw new Error("Session expired. Please sign in again.");
    }

    throw new Error(message);
  }

  return payload as T;
}
