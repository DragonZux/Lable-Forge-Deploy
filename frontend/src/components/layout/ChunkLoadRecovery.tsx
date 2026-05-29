"use client";

import { useEffect } from "react";

const CHUNK_RELOAD_STORAGE_KEY = "label-forge:chunk-reload-attempted";
const CHUNK_RELOAD_COOLDOWN_MS = 60_000;
const CHUNK_ERROR_PATTERNS = [
  /Loading chunk \d+ failed/i,
  /Failed to load chunk/i,
  /ChunkLoadError/i,
  /missing module/i,
];

function messageFromError(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isChunkLoadError(error: unknown): boolean {
  const message = messageFromError(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function reloadOnceForFreshBuild() {
  const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY));
  if (lastReload && Date.now() - lastReload < CHUNK_RELOAD_COOLDOWN_MS) {
    return;
  }

  sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, Date.now().toString());
  window.location.reload();
}

export function ChunkLoadRecovery() {
  useEffect(() => {
    const handlePromiseRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadError(event.reason)) {
        event.preventDefault();
        reloadOnceForFreshBuild();
      }
    };

    const handleScriptError = (event: ErrorEvent) => {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        reloadOnceForFreshBuild();
      }
    };

    window.addEventListener("unhandledrejection", handlePromiseRejection);
    window.addEventListener("error", handleScriptError);

    return () => {
      window.removeEventListener("unhandledrejection", handlePromiseRejection);
      window.removeEventListener("error", handleScriptError);
    };
  }, []);

  return null;
}
