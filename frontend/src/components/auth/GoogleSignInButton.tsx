"use client";

import { useEffect, useRef, useState } from "react";
import { emitAppToast } from "@/lib/toast-events";

type GoogleSignInButtonProps = {
  onCredential: (credential: string) => void;
  disabled?: boolean;
};

let googleScriptPromise: Promise<void> | null = null;
let initializedConfigKey: string | null = null;

function getGoogleRedirectUri() {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/api/auth/google/redirect`;
  }

  return "/api/auth/google/redirect";
}

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (googleScriptPromise) {
    return googleScriptPromise;
  }

  googleScriptPromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Failed to load Google sign-in")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google sign-in"));
    document.head.appendChild(script);
  });

  return googleScriptPromise;
}

export function GoogleSignInButton({ disabled = false }: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const hasRenderedButton = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [containerWidth, setContainerWidth] = useState(320);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || disabled) return;

    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (!cancelled) setScriptReady(true);
      })
      .catch((err) => {
        if (!cancelled) setScriptReady(false);
        try {
          emitAppToast({ message: 'Failed to load Google sign-in button', type: 'error' });
        } catch {
          // swallow silently if toast cannot be emitted
        }
        console.error('Failed to load Google sign-in script', err);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, disabled]);

  useEffect(() => {
    if (!buttonRef.current) return;

    const updateWidth = () => {
      const nextWidth = Math.floor(buttonRef.current?.getBoundingClientRect().width || 320);
      setContainerWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(buttonRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!scriptReady || !clientId || disabled || !buttonRef.current || !window.google?.accounts?.id) {
      return;
    }

    const loginUri = getGoogleRedirectUri();
    const configKey = `${clientId}:${loginUri}`;
    if (initializedConfigKey !== configKey) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: "redirect",
        login_uri: loginUri,
        auto_select: false,
        itp_support: true,
      });
      initializedConfigKey = configKey;
    }

    if (hasRenderedButton.current) {
      return;
    }

    const buttonWidth = Math.min(320, Math.max(180, containerWidth));
    buttonRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "outline",
      size: "large",
      shape: "pill",
      text: "continue_with",
      locale: "en",
      width: buttonWidth,
    });
    hasRenderedButton.current = true;
  }, [clientId, containerWidth, disabled, scriptReady]);

  if (!clientId) {
    return (
      <button
        type="button"
        disabled
        className="h-12 w-full rounded-xl border border-border bg-background text-sm font-semibold text-muted-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:text-foreground hover:shadow-md"
      >
        Continue with Google is not configured
      </button>
    );
  }

  return (
    <div
      className={`flex h-11 w-full items-center justify-center ${disabled ? "pointer-events-none opacity-60" : ""}`}
      ref={buttonRef}
    />
  );
}
