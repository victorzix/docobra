"use client";

import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { useRetryComuniqueSe } from "@/hooks/use-retry-comunique-se";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface RetryComuniqueSeButtonProps {
  comuniqueSeId: string;
}

export function RetryComuniqueSeButton({ comuniqueSeId }: RetryComuniqueSeButtonProps) {
  const router = useRouter();
  const retry = useRetryComuniqueSe();

  function handleRetry() {
    retry.mutate(comuniqueSeId, {
      onSuccess: () => router.refresh(),
    });
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={retry.isPending} onClick={handleRetry}>
      <RefreshCw className={cn("size-4", retry.isPending && "animate-spin")} />
      Tentar novamente
    </Button>
  );
}
