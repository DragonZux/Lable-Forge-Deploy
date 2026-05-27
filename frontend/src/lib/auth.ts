import { UserResponse } from "@/types";

const USER_KEY = "labelforge_user";
const TOKEN_KEY = "labelforge_access_token";

/**
 * Check if user is authenticated (by checking if user data exists in localStorage)
 * The JWT token is stored as HTTP-only cookie by the backend
 */
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(USER_KEY) !== null;
}

/**
 * Get current user from localStorage
 */
export function getCurrentUser(): UserResponse | null {
  if (typeof window === "undefined") return null;
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;
  try {
    return JSON.parse(userJson) as UserResponse;
  } catch {
    return null;
  }
}

/**
 * Set current user in localStorage
 */
export function setCurrentUser(user: UserResponse): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeAccessToken(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Remove current user from localStorage
 */
export function removeCurrentUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_KEY);
}

/**
 * Clear all auth data
 */
export function clearAuth(): void {
  if (typeof window === "undefined") return;
  removeCurrentUser();
  removeAccessToken();
  localStorage.removeItem("currentWorkspaceId");
}
