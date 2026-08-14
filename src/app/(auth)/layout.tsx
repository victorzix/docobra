import type { ReactNode } from "react";
import { Ruler } from "lucide-react";

import { BrandPanel, CornerMarks, Logo } from "./brand-panel";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-screen overflow-hidden lg:grid-cols-2">
      <BrandPanel />
      <div className="relative flex items-center justify-center overflow-y-auto overflow-x-hidden bg-background p-6 sm:p-10">
        <div
          className="absolute inset-0 opacity-[0.55] dark:opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(8,145,178,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(8,145,178,0.5) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(circle at 50% 0%, black, transparent 75%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 25% 15%, rgba(34,211,238,0.07), transparent 60%)",
          }}
        />
        <CornerMarks variant="light" />
        <Ruler
          className="pointer-events-none absolute -bottom-10 -right-10 size-56 rotate-[20deg] text-cyan-700/[0.05]"
          strokeWidth={1}
        />
        <div className="relative z-10 w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" variant="light" />
          {children}
        </div>
      </div>
    </div>
  );
}
