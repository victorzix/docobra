import type { Metadata } from "next";

import { LoadingSpinner } from "@/components/common/loading-spinner";

export const metadata: Metadata = {
  title: "Loading",
};

export default function LoadingPreviewPage() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.4] dark:opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(8,145,178,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(8,145,178,0.5) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(circle at 50% 50%, black, transparent 75%)",
        }}
      />
      <LoadingSpinner />
    </div>
  );
}
