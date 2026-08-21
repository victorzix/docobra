"use client";

import { useState } from "react";
import { Download, RefreshCw } from "lucide-react";

interface DownloadButtonProps {
  href: string;
  filename: string;
  label: string;
  loadingLabel: string;
}

export function DownloadButton({ href, filename, label, loadingLabel }: DownloadButtonProps) {
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleClick() {
    setErro(null);
    setCarregando(true);

    try {
      const response = await fetch(href);

      if (!response.ok) {
        let mensagem = "Não foi possível baixar o arquivo.";
        try {
          const corpo = await response.json();
          if (typeof corpo.error === "string") mensagem = corpo.error;
        } catch {
          // corpo de erro nao veio como JSON -- mantem a mensagem generica
        }
        setErro(mensagem);
        return;
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setErro("Não foi possível baixar o arquivo.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={carregando}
        className="flex items-center gap-1.5 text-sm underline disabled:no-underline disabled:opacity-60"
      >
        {carregando ? <RefreshCw className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        {carregando ? loadingLabel : label}
      </button>
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}
