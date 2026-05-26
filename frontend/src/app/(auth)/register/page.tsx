"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Mail, Lock, User, ArrowLeft, Camera } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { useInvitationActions } from "@/hooks/useInvitations";

import { Suspense } from "react";

function RegisterContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogle, register, isLoading, error } = useAuth();
  
  // Default to false for register page
  const [isLogin, setIsLogin] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Handle query parameter 'mode' just in case
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "login") {
      setIsLogin(true);
    }

    if (searchParams.get("error") === "session_expired") {
      setIsLogin(true);
      setFormError("Your session expired after 30 minutes of inactivity. Please sign in again.");
    }
  }, [searchParams]);

  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  const [registerData, setRegisterData] = useState({
    fullName: "",
    email: "",
    password: "",
  });

  const handleLoginChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));
    setFormError(null);
  };

  const handleRegisterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRegisterData((prev) => ({ ...prev, [name]: value }));
    setFormError(null);
  };

  const handleLoginSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    try {
      await login(loginData.email, loginData.password);
      router.push("/dashboard");
    } catch (err: any) {
      setFormError(err.message || "Login failed");
    }
  };

  const { acceptWorkspace, acceptProject } = useInvitationActions();

  const acceptPendingInvitation = async () => {
    let acceptedWorkspaceId: string | null = null;
    const invitationToken = searchParams.get("invitation");
    const invitationType = searchParams.get("type");

    if (invitationToken) {
      try {
        if (invitationType === "workspace") {
          const response = await acceptWorkspace(invitationToken);
          acceptedWorkspaceId = response?.data?.workspace_id || null;
        } else if (invitationType === "project") {
          const response = await acceptProject(invitationToken);
          acceptedWorkspaceId = response?.data?.workspace_id || null;
        }
      } catch (inviteErr) {
        console.error("Failed to auto-accept invitation:", inviteErr);
      }
    }

    return acceptedWorkspaceId;
  };

  const handleRegisterSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    try {
      const result = await register(registerData.email, registerData.password, registerData.fullName);
      const acceptedWorkspaceId = await acceptPendingInvitation();
      
      const workspaceIdToOpen = acceptedWorkspaceId || result.default_workspace_id;
      if (workspaceIdToOpen) {
        localStorage.setItem("currentWorkspaceId", workspaceIdToOpen);
      }
      router.push("/dashboard");
    } catch (err: any) {
      setFormError(err.message || "Registration failed");
    }
  };

  const handleGoogleCredential = async (credential: string) => {
    setFormError(null);
    try {
      const result = await loginWithGoogle(credential);
      const acceptedWorkspaceId = await acceptPendingInvitation();
      const workspaceIdToOpen = acceptedWorkspaceId || result.default_workspace_id;
      if (workspaceIdToOpen) {
        localStorage.setItem("currentWorkspaceId", workspaceIdToOpen);
      }
      router.push("/dashboard");
    } catch (err: any) {
      setFormError(err.message || "Google login failed");
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4 font-sans">
      {/* Back Button */}
      <Link 
        href="/" 
        className="absolute left-4 top-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card/80 px-4 py-2 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-accent sm:left-8 sm:top-8"
      >
        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        <span className="font-bold text-sm uppercase tracking-wider">Back to home</span>
      </Link>

      <div className="relative flex w-full max-w-[1000px] min-h-[620px] overflow-hidden rounded-xl border border-border bg-card shadow-xl lg:h-[650px]">
        
        {/* Sign In Form (Left side) */}
        <div className={`h-full w-full flex-col items-center justify-center p-6 transition-all duration-700 ease-in-out sm:p-10 lg:flex lg:w-1/2 lg:p-12 ${isLogin ? "flex opacity-100 translate-x-0" : "hidden opacity-0 translate-x-full pointer-events-none lg:flex"}`}>
          <form onSubmit={handleLoginSubmit} className="w-full max-w-sm flex flex-col items-center">
            <h1 className="mb-3 text-center font-display text-4xl leading-tight text-foreground">Sign in to <span className="gradient-text">Label Forge</span></h1>
            
            <div className="mb-6 w-full">
              <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isLoading} />
            </div>
            
            <p className="text-muted-foreground text-sm mb-6">or use your email account:</p>
            
            <div className="w-full space-y-4 mb-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  name="email"
                  type="email"
                  placeholder="Email"
                  value={loginData.email}
                  onChange={handleLoginChange}
                  className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-foreground outline-none transition-all placeholder:text-muted-foreground/50 hover:border-accent/30 focus:border-accent focus:ring-4 focus:ring-accent/10"
                  required
                />
              </div>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  name="password"
                  type="password"
                  placeholder="Password"
                  value={loginData.password}
                  onChange={handleLoginChange}
                  className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-foreground outline-none transition-all placeholder:text-muted-foreground/50 hover:border-accent/30 focus:border-accent focus:ring-4 focus:ring-accent/10"
                  required
                />
              </div>
            </div>

            <button type="button" className="text-muted-foreground text-sm mb-8 hover:text-accent transition-colors border-b border-transparent hover:border-accent">
              Forgot your password?
            </button>

            {(formError || error) && isLogin && (
              <p className="text-red-500 text-sm mb-4 font-medium">{formError || error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="h-14 w-48 rounded-xl bg-gradient-to-r from-accent to-accent-secondary font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-accent-lg active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? "Signing in..." : "SIGN IN"}
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(false)}
              className="mt-5 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-accent hover:underline lg:hidden"
            >
              Create a new account
            </button>
          </form>
        </div>

        {/* Sign Up Form (Right side) */}
        <div className={`h-full w-full flex-col items-center justify-center p-6 transition-all duration-700 ease-in-out sm:p-10 lg:flex lg:w-1/2 lg:p-12 ${!isLogin ? "flex opacity-100 translate-x-0" : "hidden opacity-0 translate-x-full pointer-events-none lg:flex"}`}>
          <form onSubmit={handleRegisterSubmit} className="w-full max-w-sm flex flex-col items-center">
            <h1 className="mb-3 text-center font-display text-4xl leading-tight text-foreground">Create <span className="gradient-text">Account</span></h1>
            
            <div className="mb-6 w-full">
              <GoogleSignInButton onCredential={handleGoogleCredential} disabled={isLoading} />
            </div>
            
            <p className="text-muted-foreground text-sm mb-6">or use your email for registration:</p>
            
            <div className="w-full space-y-4 mb-8">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <User className="w-5 h-5" />
                </div>
                <input
                  name="fullName"
                  type="text"
                  placeholder="Name"
                  value={registerData.fullName}
                  onChange={handleRegisterChange}
                  className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-foreground outline-none transition-all placeholder:text-muted-foreground/50 hover:border-accent/30 focus:border-accent focus:ring-4 focus:ring-accent/10"
                  required
                />
              </div>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  name="email"
                  type="email"
                  placeholder="Email"
                  value={registerData.email}
                  onChange={handleRegisterChange}
                  className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-foreground outline-none transition-all placeholder:text-muted-foreground/50 hover:border-accent/30 focus:border-accent focus:ring-4 focus:ring-accent/10"
                  required
                />
              </div>
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  name="password"
                  type="password"
                  placeholder="Password"
                  value={registerData.password}
                  onChange={handleRegisterChange}
                  className="h-14 w-full rounded-xl border border-border bg-background pl-12 pr-4 text-foreground outline-none transition-all placeholder:text-muted-foreground/50 hover:border-accent/30 focus:border-accent focus:ring-4 focus:ring-accent/10"
                  required
                />
              </div>
            </div>

            {(formError || error) && !isLogin && (
              <p className="text-red-500 text-sm mb-4 font-medium">{formError || error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="h-14 w-48 rounded-xl bg-gradient-to-r from-accent to-accent-secondary font-bold uppercase tracking-wider text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-accent-lg active:scale-[0.98] disabled:opacity-50"
            >
              {isLoading ? "Creating..." : "SIGN UP"}
            </button>
            <button
              type="button"
              onClick={() => setIsLogin(true)}
              className="mt-5 text-sm font-semibold text-muted-foreground underline-offset-4 hover:text-accent hover:underline lg:hidden"
            >
              Sign in instead
            </button>
          </form>
        </div>

        {/* Sliding Overlay Panel */}
        <div 
          className={`absolute top-0 left-1/2 z-20 hidden h-full w-1/2 overflow-hidden transition-all duration-700 ease-in-out lg:block ${isLogin ? "translate-x-0" : "-translate-x-full"}`}
          style={{ 
            borderRadius: isLogin ? "0 24px 24px 0" : "24px 0 0 24px" 
          }}
        >
          <div className={`dot-pattern-light relative h-full w-[200%] bg-gradient-to-br from-accent to-accent-secondary text-white transition-all duration-700 ease-in-out ${isLogin ? "translate-x-0" : "-translate-x-1/2"}`}>
            
            {/* Background abstract shapes */}
            <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
              <div className="absolute -top-20 -left-20 w-64 h-64 border-[40px] border-white rounded-full" />
              <div className="absolute bottom-20 right-20 w-48 h-48 bg-white rotate-45" />
              <div className="absolute top-1/2 left-1/4 w-0 h-0 border-l-[30px] border-l-transparent border-r-[30px] border-r-transparent border-b-[50px] border-b-white" />
            </div>

            <div className="flex h-full w-full">
              {/* Overlay Panel (Visible when Login - slides to right) */}
              <div className="w-1/2 h-full flex flex-col items-center justify-center p-12 text-center relative">
                <div className="absolute top-8 left-8 flex items-center gap-2">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                    <Camera className="w-5 h-5 text-accent" />
                  </div>
                  <span className="font-bold text-xl tracking-tight">Label Forge</span>
                </div>
                
                <h2 className="mb-6 font-display text-4xl leading-tight">Hello, Friend!</h2>
                <p className="text-lg mb-10 text-white/90">Enter your personal details and start your journey with us</p>
                <button
                  type="button"
                  onClick={() => setIsLogin(false)}
                  className="h-14 w-48 rounded-xl border-2 border-white font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 hover:bg-white hover:text-accent active:scale-[0.98]"
                >
                  SIGN UP
                </button>
              </div>

              {/* Overlay Panel (Visible when Register - slides to left) */}
              <div className="w-1/2 h-full flex flex-col items-center justify-center p-12 text-center relative">
                <div className="absolute top-8 left-8 flex items-center gap-2">
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                    <Camera className="w-5 h-5 text-accent" />
                  </div>
                  <span className="font-bold text-xl tracking-tight">Label Forge</span>
                </div>

                <h2 className="mb-6 font-display text-4xl leading-tight">Welcome Back!</h2>
                <p className="text-lg mb-10 text-white/90">To keep connected with us please login with your personal info</p>
                <button
                  type="button"
                  onClick={() => setIsLogin(true)}
                  className="h-14 w-48 rounded-xl border-2 border-white font-bold uppercase tracking-wider transition-all hover:-translate-y-0.5 hover:bg-white hover:text-accent active:scale-[0.98]"
                >
                  SIGN IN
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen w-full flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    }>
      <RegisterContent />
    </Suspense>
  );
}

