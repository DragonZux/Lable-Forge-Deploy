"use client";

import React from "react";
import { Button } from "@/components/ui/Button";
import { RefreshCw, ChevronLeft, ShieldAlert } from "lucide-react";
import { motion } from "framer-motion";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorProps) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-6">
      <div className="absolute inset-x-0 top-0 -z-10 h-[50vh] bg-gradient-to-b from-red-500/10 via-background to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, type: "spring", damping: 20 }}
        className="z-10 w-full max-w-lg"
      >
        <div className="relative">
          <div className="panel relative overflow-hidden p-8 text-center sm:p-12">
            
            {/* Animated Red Border Gradient */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
            
            <div className="flex flex-col items-center text-center">
              <motion.div 
                whileHover={{ rotate: 5, scale: 1.05 }}
                className="relative mb-10 flex h-24 w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-600 shadow-[0_20px_40px_-12px_rgba(239,68,68,0.4)]"
              >
                <ShieldAlert className="w-12 h-12 text-white" />
              </motion.div>
              
              <h1 className="mb-4 font-display text-4xl leading-tight text-foreground sm:text-5xl">
                System <span className="text-red-500">Glitch</span>
              </h1>
              
              <p className="text-muted-foreground text-lg leading-relaxed mb-10 max-w-sm font-medium">
                {error.message || "Something went wrong under the hood. Our engineers have been notified."}
              </p>

              {/* Development Error Details */}
              {process.env.NODE_ENV === "development" && (
                 <motion.div 
                   initial={{ opacity: 0, height: 0 }}
                   animate={{ opacity: 1, height: 'auto' }}
                   className="w-full mb-10 text-left"
                 >
                    <div className="overflow-hidden rounded-2xl border border-border bg-muted/40 p-6">
                       <div className="flex items-center gap-2 mb-3">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                             Diagnostic Report
                          </p>
                       </div>
                       <div className="max-h-40 overflow-auto custom-scrollbar pr-2">
                          <pre className="text-[11px] font-mono text-muted-foreground/80 leading-relaxed whitespace-pre-wrap">
                             {error.stack || error.digest || "An internal error occurred."}
                          </pre>
                       </div>
                    </div>
                 </motion.div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 w-full">
                <Button 
                  variant="secondary" 
                  onClick={() => window.history.back()}
                  className="h-14 flex-1 rounded-xl font-bold group"
                >
                  <ChevronLeft className="w-5 h-5 mr-2 group-hover:-translate-x-1 transition-transform" />
                  Go Back
                </Button>
                <Button 
                  onClick={reset}
                  className="h-14 flex-1 rounded-xl font-bold group"
                >
                  <RefreshCw className="w-5 h-5 mr-2 group-hover:rotate-180 transition-transform duration-500" />
                  Try Again
                </Button>
              </div>
            </div>
          </div>
          
        </div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex items-center justify-center gap-3 mt-12"
        >
          <div className="h-px w-8 bg-border/50" />
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.3em] opacity-40">
            Label Forge Core Error Handler
          </p>
          <div className="h-px w-8 bg-border/50" />
        </motion.div>
      </motion.div>
    </div>
  );
}
