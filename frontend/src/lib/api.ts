import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";
import { clearAuth } from "./auth";
import { emitAppToast } from "./toast-events";

// Get base URL - use absolute URL on server, relative on client
const isServer = typeof window === "undefined";
const API_BASE_URL = isServer
  ? (process.env.INTERNAL_API_URL || "http://127.0.0.1:8000/api")
  : (process.env.NEXT_PUBLIC_API_URL || "/api");

const recentErrorToasts = new Map<string, number>();

function getFriendlyApiErrorMessage(error: AxiosError) {
  if (error.code === "ERR_CANCELED") {
    return null;
  }

  if (!error.response) {
    return "Cannot reach the backend. Please check that the API server is running.";
  }

  const status = error.response.status;

  if (status >= 500) {
    return "Server error. Please try again in a moment.";
  }

  const errorData = error.response.data as any;

  if (typeof errorData === "string" && errorData.trim()) {
    return errorData;
  }

  if (errorData?.detail) {
    if (typeof errorData.detail === "string") {
      return errorData.detail;
    }

    if (Array.isArray(errorData.detail)) {
      return errorData.detail
        .map((err: any) => `${err.loc.join('.')}: ${err.msg}`)
        .join(", ");
    }
  }

  if (errorData?.message) {
    return errorData.message;
  }

  return error.message || "An unexpected error occurred";
}

function notifyApiError(error: AxiosError, message: string) {
  if (typeof window === "undefined") {
    return;
  }

  const status = error.response?.status ?? "network";
  const cacheKey = `${status}:${message}`;
  const now = Date.now();
  const lastShownAt = recentErrorToasts.get(cacheKey) ?? 0;

  if (now - lastShownAt < 3000) {
    return;
  }

  recentErrorToasts.set(cacheKey, now);
  emitAppToast({
    message,
    type: "error",
    duration: 5000,
  });
}

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  // Include cookies (HTTP-only auth token) in requests
  withCredentials: true,
});

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle 401 errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      if (typeof window !== "undefined") {
        const currentPath = window.location.pathname;
        const currentSearch = window.location.search;
        const isAuthPage = currentPath === "/login" || currentPath === "/register";
        const alreadyOnExpiredLogin =
          currentPath === "/login" && currentSearch.includes("error=session_expired");

        clearAuth();

        if (!isAuthPage && !alreadyOnExpiredLogin) {
          window.location.replace("/login?error=session_expired");
        }
      }
    }

    const errorMessage = getFriendlyApiErrorMessage(error);

    if (error.response?.status !== 401 && errorMessage) {
      notifyApiError(error, errorMessage);
    }

    const apiError = new Error(errorMessage);
    // Attach extra info for debugging and custom handling
    (apiError as any).status = error.response?.status;
    (apiError as any).data = error.response?.data;
    (apiError as any).detail = errorMessage;
    (apiError as any).code = (error.response?.data as any)?.code || "ERROR";
    (apiError as any).response = error.response;

    return Promise.reject(apiError);
  }
);

// Typed API methods
export async function apiGet<T>(
  url: string,
  params?: Record<string, any>
): Promise<T> {
  const response = await api.get<T>(url, { params });
  return response.data;
}

export async function apiPost<T>(
  url: string,
  data?: Record<string, any>,
  params?: Record<string, any>
): Promise<T> {
  const response = await api.post<T>(url, data, { params });
  return response.data;
}

export async function apiPatch<T>(
  url: string,
  data?: Record<string, any>
): Promise<T> {
  const response = await api.patch<T>(url, data);
  return response.data;
}

export async function apiDelete<T>(
  url: string,
  data?: Record<string, any>
): Promise<T | void> {
  const response = await api.delete(url, data ? { data } : undefined);
  return response.data;
}

export { api };
export default api;
