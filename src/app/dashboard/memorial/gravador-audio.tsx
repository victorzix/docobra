"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Pause, Play, Square } from "lucide-react";

interface GravadorAudioProps {
  onGravado: (audioBase64: string, mimeType: string) => void;
}

interface SpeechRecognitionResultLike {
  [index: number]: { transcript: string };
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

function obterConstrutorReconhecimento() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
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
  const [legendaViva, setLegendaViva] = useState("");
  const [tocando, setTocando] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const reconhecimentoRef = useRef<SpeechRecognitionLike | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    return () => {
      reconhecimentoRef.current?.stop();
    };
  }, []);

  async function iniciarGravacao() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = "audio/webm";
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    setLegendaViva("");
    setTocando(false);
    setUrlPreview(null);

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

    // Legenda em tempo real e so um apoio visual — a transcricao que de fato
    // vira o memorial continua sendo feita no servidor a partir do audio.
    const ConstrutorReconhecimento = obterConstrutorReconhecimento();
    if (ConstrutorReconhecimento) {
      const reconhecimento = new ConstrutorReconhecimento();
      reconhecimento.lang = "pt-BR";
      reconhecimento.continuous = true;
      reconhecimento.interimResults = true;
      reconhecimento.onresult = (evento) => {
        let texto = "";
        for (let i = 0; i < evento.results.length; i++) {
          texto += evento.results[i][0].transcript;
        }
        setLegendaViva(texto);
      };
      reconhecimento.onerror = () => {
        // Se a legenda falhar (ex.: sem permissao, sem rede), a gravacao em
        // si segue normal — e so um apoio visual, nao a fonte da transcricao.
      };
      reconhecimento.start();
      reconhecimentoRef.current = reconhecimento;
    }
  }

  function pararGravacao() {
    mediaRecorderRef.current?.stop();
    reconhecimentoRef.current?.stop();
    reconhecimentoRef.current = null;
    setGravando(false);
  }

  function alternarReproducao() {
    const audio = audioRef.current;
    if (!audio) return;

    if (tocando) {
      audio.pause();
    } else {
      audio.play();
    }
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
        {gravando ? "Gravando... toque para parar" : urlPreview ? "Toque para gravar de novo" : "Toque para gravar"}
      </p>

      <AnimatePresence>
        {gravando && legendaViva && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mx-4 max-h-24 w-full max-w-sm overflow-y-auto rounded-md bg-muted px-3 py-2 text-sm text-foreground"
          >
            {legendaViva}
          </motion.div>
        )}
      </AnimatePresence>

      {!gravando && urlPreview && (
        <div className="mx-4 flex w-full max-w-sm flex-col gap-2">
          <button
            type="button"
            onClick={alternarReproducao}
            className="flex items-center gap-1.5 self-center text-xs font-medium text-primary"
          >
            {tocando ? <Pause className="size-3" /> : <Play className="size-3" />}
            {tocando ? "Pausar" : "Ouvir gravação"}
          </button>
          {legendaViva && (
            <div className="max-h-28 overflow-y-auto rounded-md bg-muted px-3 py-2 text-sm text-foreground">
              {legendaViva}
            </div>
          )}
        </div>
      )}

      <audio
        ref={audioRef}
        src={urlPreview ?? undefined}
        className="hidden"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => setTocando(false)}
      />
    </div>
  );
}
