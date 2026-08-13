"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

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
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant={gravando ? "destructive" : "default"}
        onClick={gravando ? pararGravacao : iniciarGravacao}
      >
        {gravando ? "Parar gravação" : "Gravar áudio"}
      </Button>
      {urlPreview && <audio controls src={urlPreview} />}
    </div>
  );
}
