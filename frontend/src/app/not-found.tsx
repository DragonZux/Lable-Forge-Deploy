import React from "react";
import { Card, EmptyState } from "@/components/ui";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <EmptyState
          title="404 - Page Not Found"
          description="The page you're looking for doesn't exist or has been moved."
          action={{
            label: "Back to Dashboard",
            href: "/dashboard",
          }}
        />
      </Card>
    </div>
  );
}
