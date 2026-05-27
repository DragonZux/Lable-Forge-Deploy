"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { UserResponse } from "@/types";
import { apiPost, apiGet } from "@/lib/api";
import {
  getCurrentUser,
  setAccessToken,
  setCurrentUser,
  clearAuth,
  isAuthenticated,
} from "@/lib/auth";

// Track if we've attempted to fetch the user profile in this session
let globalAuthChecked = false;
let globalUser: UserResponse | null = null;

const setGlobalUser = (newUser: UserResponse | null) => {
  globalUser = newUser;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("auth-user-changed", { detail: newUser }));
  }
};

interface UseAuthReturn {
  user: UserResponse | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<{ default_workspace_id?: string }>;
  register: (email: string, password: string, fullName: string) => Promise<{ default_workspace_id?: string }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isCheckingAuth: boolean;
  refetchUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUserState] = useState<UserResponse | null>(globalUser);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(!globalAuthChecked);
  const [error, setError] = useState<string | null>(null);
  
  const pathname = usePathname();
  const checkStarted = useRef(false);

  const setUser = useCallback((val: UserResponse | null) => {
    setUserState(val);
    setGlobalUser(val);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    const handleUserChanged = (e: Event) => {
      const customEvent = e as CustomEvent<UserResponse | null>;
      setUserState(customEvent.detail);
    };

    window.addEventListener("auth-user-changed", handleUserChanged);
    return () => {
      window.removeEventListener("auth-user-changed", handleUserChanged);
    };
  }, []);

  const refetchUser = useCallback(async () => {
    try {
      const freshUser = await apiGet<UserResponse>("/auth/me");
      setCurrentUser(freshUser);
      setUser(freshUser);
    } catch (err) {
      if ((err as any)?.status !== 401) {
        console.error("Failed to refetch user profile", err);
      }
    }
  }, [setUser]);

  useEffect(() => {
    if (globalAuthChecked || checkStarted.current) {
      if (globalAuthChecked) {
        setIsCheckingAuth(false);
        setUser(globalUser);
      }
      return;
    }

    const initAuth = async () => {
      checkStarted.current = true;
      const normalizedPath = pathname?.replace(/\/$/, "") || "";
      const isAuthPage = normalizedPath === "/login" || normalizedPath === "/register";
      const localUser = getCurrentUser();
      
      try {
        if (localUser) {
          setUser(localUser);
          globalUser = localUser;
          if (!isAuthPage) {
            await refetchUser();
          }
        } else if (!isAuthPage && normalizedPath !== "" && normalizedPath !== "/") {
          await refetchUser();
        }
      } catch {
        clearAuth();
        setUser(null);
        globalUser = null;
      } finally {
        globalAuthChecked = true;
        setIsCheckingAuth(false);
      }
    };

    initAuth();
  }, [pathname, refetchUser, setUser]);

  const login = useCallback(async (email: string, password: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiPost<{
        access_token: string;
        token_type: string;
        user: UserResponse;
      }>("/auth/login", { email, password });

      setCurrentUser(response.user);
      setAccessToken(response.access_token);
      setUser(response.user);
      globalUser = response.user;
      globalAuthChecked = true;
    } catch (err: any) {
      const errorMessage = err.detail || "Login failed.";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [setUser]);

  const loginWithGoogle = useCallback(async (credential: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiPost<{
        access_token: string;
        token_type: string;
        user: UserResponse;
        default_workspace_id?: string;
      }>("/auth/google", { credential });

      setCurrentUser(response.user);
      setAccessToken(response.access_token);
      setUser(response.user);
      globalUser = response.user;
      globalAuthChecked = true;
      return { default_workspace_id: response.default_workspace_id };
    } catch (err: any) {
      const errorMessage = err.detail || "Google login failed.";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [setUser]);

  const register = useCallback(async (email: string, password: string, fullName: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiPost<{
        access_token: string;
        token_type: string;
        user: UserResponse;
        default_workspace_id?: string;
      }>("/auth/register", { email, password, full_name: fullName });

      setCurrentUser(response.user);
      setAccessToken(response.access_token);
      setUser(response.user);
      globalUser = response.user;
      globalAuthChecked = true;
      return { default_workspace_id: response.default_workspace_id };
    } catch (err: any) {
      const errorMessage = err.detail || "Registration failed.";
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [setUser]);

  const router = useRouter();

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await apiPost("/auth/logout", {});
    } catch {
    } finally {
      clearAuth();
      setUser(null);
      globalUser = null;
      globalAuthChecked = true;
      setIsLoading(false);
      router.push("/login");
    }
  }, [router, setUser]);

  return {
    user,
    isLoading,
    error,
    login,
    loginWithGoogle,
    register,
    logout,
    isAuthenticated: !!user && isAuthenticated(),
    isCheckingAuth,
    refetchUser,
  };
}
