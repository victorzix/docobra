"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { CircleAlert, Eye, EyeOff, Lock, Mail } from "lucide-react";

import { loginSchema, type LoginInput } from "@/lib/validations/auth/login.schema";
import { useLogin } from "@/hooks/use-login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const logar = useLogin();
  const [mostrarSenha, setMostrarSenha] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", senha: "" },
  });

  function onSubmit(values: LoginInput) {
    logar.mutate(values, {
      onSuccess: () => {
        const from = searchParams.get("from");
        const destino = from?.startsWith("/") && !from.startsWith("//") ? from : "/dashboard";
        router.push(destino);
      },
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="mb-8">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium tracking-widest text-cyan-700 uppercase">
            Acesso
          </span>
          <motion.span
            className="h-px flex-1 max-w-8 origin-left bg-cyan-600/40"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          />
        </div>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight">Entrar</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Acesse sua conta para continuar seus projetos.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-5">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-mono text-[11px] font-medium tracking-wider text-slate-500 uppercase">
                  Email
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="email"
                      autoComplete="email"
                      autoFocus
                      placeholder="voce@empresa.com"
                      className="pl-9 focus-visible:border-cyan-600 focus-visible:ring-cyan-500/30"
                      {...field}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="senha"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="font-mono text-[11px] font-medium tracking-wider text-slate-500 uppercase">
                  Senha
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type={mostrarSenha ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pl-9 pr-9 focus-visible:border-cyan-600 focus-visible:ring-cyan-500/30"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarSenha((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {mostrarSenha ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {logar.isError && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              <span>{logar.error.message}</span>
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={logar.isPending}
            className="mt-1 w-full bg-[#0a2c4d] text-white shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#0d3a63] hover:shadow-lg hover:shadow-cyan-900/20 active:translate-y-0"
          >
            {logar.isPending ? "Entrando..." : "Entrar"}
          </Button>
        </form>
      </Form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        Não tem uma conta?{" "}
        <Link href="/register" className="font-medium text-cyan-700 hover:text-cyan-800 hover:underline">
          Criar conta
        </Link>
      </p>
    </motion.div>
  );
}
