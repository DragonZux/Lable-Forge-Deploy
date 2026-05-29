"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowLeft, Check, AlertCircle, RefreshCw } from "lucide-react";
import { Suspense } from "react";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setFormError("Missing reset token. Please request a new recovery link.");
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);

    if (!token) {
      setFormError("Missing reset token. Please request a new recovery link.");
      return;
    }

    if (password.length < 6) {
      setFormError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setFormError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Failed to reset password.");
      }

      setIsSuccess(true);
    } catch (err: any) {
      setFormError(err.message || "Failed to reset password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 font-sans">
      {/* Back Button */}
      <Link 
        href="/login" 
        className="absolute left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-accent sm:left-8 sm:top-8"
      >
        <ArrowLeft className="w-5 h-5 transition-transform" />
        <span className="font-bold text-sm uppercase tracking-wider">Back to Sign In</span>
      </Link>

      <div className="relative flex w-full max-w-[480px] min-h-[500px] flex-col items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-8 sm:p-10 shadow-xl">
        {/* Glow backdrop decoration */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-48 h-48 bg-accent/5 rounded-full blur-3xl pointer-events-none" />

        {isSuccess ? (
          <div className="text-center w-full space-y-6">
            <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
              <Check className="w-8 h-8" />
            </div>
            <h1 className="font-display text-3xl leading-tight text-foreground">Password <span className="gradient-text">Updated</span></h1>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
              Your password has been successfully reset. You can now use your new password to sign in.
            </p>
            <Link
              href="/login"
              className="mt-6 flex h-14 w-full items-center justify-center rounded-xl bg-gradient-to-r from-accent to-accent-secondary font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-accent-lg"
            >
              Sign In Now
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
            <h1 className="mb-3 text-center font-display text-3xl leading-tight text-foreground">Reset <span className="gradient-text">Password</span></h1>
            <p className="text-muted-foreground text-sm text-center mb-8">
              Please enter your new password below to secure your account.
            </p>

            <div className="w-full space-y-4 mb-6">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  placeholder="New Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError(null);
                  }}
                  className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-foreground outline-none transition-all placeholder:text-muted-foreground/50 hover:border-accent/30 focus:border-accent focus:ring-4 focus:ring-accent/10"
                  required
                  disabled={!token || isSubmitting}
                />
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type="password"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setFormError(null);
                  }}
                  className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-foreground outline-none transition-all placeholder:text-muted-foreground/50 hover:border-accent/30 focus:border-accent focus:ring-4 focus:ring-accent/10"
                  required
                  disabled={!token || isSubmitting}
                />
              </div>
            </div>

            {formError && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/10 bg-red-500/5 p-4 w-full text-left">
                <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
                <p className="text-xs font-semibold text-red-500/90 leading-relaxed">{formError}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={!token || isSubmitting}
              className="h-14 w-full rounded-xl bg-gradient-to-r from-accent to-accent-secondary font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-accent-lg active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                "Update Password"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
