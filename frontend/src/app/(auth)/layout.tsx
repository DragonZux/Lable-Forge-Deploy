"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const { user, isCheckingAuth } = useAuth();

  useEffect(() => {
    if (!isCheckingAuth && user) {
      router.replace("/dashboard");
    }
  }, [isCheckingAuth, user, router]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      {children}
    </div>
  );
}
