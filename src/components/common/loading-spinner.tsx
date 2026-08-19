"use client";

import { motion } from "framer-motion";

const CUBE_SIZE = 64;
const HALF = CUBE_SIZE / 2;

const GRID = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
  backgroundSize: "11px 11px",
};

const FACES = [
  { transform: `translateZ(${HALF}px)`, className: "border-primary/80 bg-primary/35" },
  { transform: `rotateY(180deg) translateZ(${HALF}px)`, className: "border-primary/50 bg-primary/15" },
  { transform: `rotateY(90deg) translateZ(${HALF}px)`, className: "border-orange-400/80 bg-orange-500/35" },
  { transform: `rotateY(-90deg) translateZ(${HALF}px)`, className: "border-orange-400/45 bg-orange-500/10" },
  { transform: `rotateX(90deg) translateZ(${HALF}px)`, className: "border-cyan-300/80 bg-cyan-400/30" },
  { transform: `rotateX(-90deg) translateZ(${HALF}px)`, className: "border-cyan-300/40 bg-cyan-400/10" },
];

export function LoadingSpinner({ label = "Carregando" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className="relative flex h-24 w-24 items-center justify-center" style={{ perspective: 340 }}>
        <div className="absolute inset-0 rounded-full bg-primary/25 blur-2xl dark:bg-primary/15" />

        <motion.div
          className="absolute inset-x-0 bottom-3 mx-auto h-3 w-16 rounded-full bg-primary/25 blur-[4px] dark:bg-primary/30"
          animate={{ scaleX: [1, 0.8, 1], opacity: [0.6, 0.35, 0.6] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="relative"
          style={{
            width: CUBE_SIZE,
            height: CUBE_SIZE,
            transformStyle: "preserve-3d",
            filter: "drop-shadow(0 8px 12px rgba(8,145,178,0.25))",
          }}
          animate={{ rotateY: [-48, 48], rotateX: [-18, -34], y: [0, -9, 0] }}
          transition={{
            rotateY: { duration: 4.5, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
            rotateX: { duration: 3.2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
            y: { duration: 2, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" },
          }}
        >
          {FACES.map((face, i) => (
            <div
              key={i}
              className={`absolute inset-0 rounded-[4px] border shadow-[inset_0_0_14px_rgba(255,255,255,0.2)] ${face.className}`}
              style={{ transform: face.transform, transformStyle: "preserve-3d", ...GRID }}
            />
          ))}
        </motion.div>
      </div>

      <div className="flex items-center gap-1.5 font-mono text-xs font-medium tracking-widest text-muted-foreground uppercase">
        <span>{label}</span>
        <span className="flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="size-1 rounded-full bg-orange-500"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}
