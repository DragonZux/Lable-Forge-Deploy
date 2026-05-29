"use client";

import React, { ReactNode, ErrorInfo } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RELOAD_STORAGE_KEY = "label-forge:chunk-reload-attempted";
const CHUNK_RELOAD_COOLDOWN_MS = 60_000;
const CHUNK_ERROR_PATTERNS = [
  /Loading chunk \d+ failed/i,
  /Failed to load chunk/i,
  /ChunkLoadError/i,
  /missing module/i,
];

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : JSON.stringify(error);

  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function reloadOnceForFreshBuild(): boolean {
  if (typeof window === "undefined") return false;

  const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY));
  if (lastReload && Date.now() - lastReload < CHUNK_RELOAD_COOLDOWN_MS) {
    return false;
  }

  sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, Date.now().toString());
  window.location.reload();
  return true;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    if (isChunkLoadError(error) && reloadOnceForFreshBuild()) {
      return;
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="space-y-4">
              <div>
                <h1 className="text-2xl font-bold text-foreground mb-2">
                  Oops! Something went wrong
                </h1>
                <p className="text-muted-foreground">
                  {this.state.error?.message ||
                    "An unexpected error occurred"}
                </p>
              </div>

              {process.env.NODE_ENV === "development" && (
                <details className="bg-muted p-3 rounded text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-semibold mb-2">
                    Error Details
                  </summary>
                  <pre className="overflow-auto max-h-32 whitespace-pre-wrap">
                    {this.state.error?.stack}
                  </pre>
                </details>
              )}

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => window.history.back()}
                >
                  Go Back
                </Button>
                <Button
                  onClick={() => {
                    this.setState({ hasError: false, error: null });
                    window.location.href = "/";
                  }}
                >
                  Home
                </Button>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
