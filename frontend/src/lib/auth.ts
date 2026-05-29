import { UserResponse } from "@/types";

const USER_KEY = "labelforge_user";

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
  localStorage.removeItem("currentWorkspaceId");
}
