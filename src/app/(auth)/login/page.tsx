import { Suspense } from "react";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar",
};

function LoginFormSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 grid gap-2">
        <div className="h-3 w-14 rounded bg-muted" />
        <div className="h-7 w-24 rounded bg-muted" />
        <div className="h-4 w-56 rounded bg-muted" />
      </div>
      <div className="grid gap-5">
        <div className="grid gap-2">
          <div className="h-3 w-10 rounded bg-muted" />
          <div className="h-9 rounded-md bg-muted" />
        </div>
        <div className="grid gap-2">
          <div className="h-3 w-12 rounded bg-muted" />
          <div className="h-9 rounded-md bg-muted" />
        </div>
        <div className="mt-1 h-11 rounded-md bg-muted" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <LoginForm />
    </Suspense>
  );
}
