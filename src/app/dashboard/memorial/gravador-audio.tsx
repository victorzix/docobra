"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, Square } from "lucide-react";

interface GravadorAudioProps {
  onGravado: (audioBase64: string, mimeType: string) => void;
}

function arrayBufferParaBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario);
}

export function GravadorAudio({ onGravado }: GravadorAudioProps) {
  const [gravando, setGravando] = useState(false);
  const [urlPreview, setUrlPreview] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function iniciarGravacao() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (evento) => {
      if (evento.data.size > 0) chunksRef.current.push(evento.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      setUrlPreview(URL.createObjectURL(blob));
      const buffer = await blob.arrayBuffer();
      onGravado(arrayBufferParaBase64(buffer), mimeType);
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorderRef.current = recorder;
    recorder.start();
    setGravando(true);
  }

  function pararGravacao() {
    mediaRecorderRef.current?.stop();
    setGravando(false);
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-6">
      <button
        type="button"
        onClick={gravando ? pararGravacao : iniciarGravacao}
        className="relative flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-colors data-[gravando=true]:bg-destructive data-[gravando=true]:text-white"
        data-gravando={gravando}
      >
        {gravando && (
          <motion.span
            className="absolute inset-0 rounded-full bg-destructive"
            animate={{ scale: [1, 1.6], opacity: [0.5, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        {gravando ? <Square className="size-5 fill-current" /> : <Mic className="size-5" />}
      </button>
      <p className="text-sm text-muted-foreground">
        {gravando ? "Gravando... toque para parar" : "Toque para gravar"}
      </p>
      {urlPreview && <audio controls src={urlPreview} className="mt-1 h-9" />}
    </div>
  );
}
