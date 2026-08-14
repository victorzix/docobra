import type { ReactNode } from "react";

import { BrandPanel, Logo } from "./brand-panel";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid h-screen overflow-hidden lg:grid-cols-2">
      <BrandPanel />
      <div className="relative flex items-center justify-center overflow-y-auto overflow-x-hidden bg-background p-6 sm:p-10">
        <div
          className="absolute inset-0 opacity-[0.4] dark:opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            maskImage: "radial-gradient(circle at 50% 0%, black, transparent 75%)",
          }}
        />
        <div className="relative z-10 w-full max-w-sm">
          <Logo className="mb-10 lg:hidden" variant="light" />
          {children}
        </div>
      </div>
    </div>
  );
}
