"use client";

import { motion } from "framer-motion";

export function Typewriter({
  text,
  delay = 0,
  duration = 1,
  className,
}: {
  text: string;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-baseline ${className ?? ""}`}>
      <motion.span
        className="inline-block overflow-hidden whitespace-nowrap"
        initial={{ clipPath: "inset(0 100% 0 0)" }}
        animate={{ clipPath: "inset(0 0% 0 0)" }}
        transition={{ delay, duration, ease: "linear" }}
      >
        {text}
      </motion.span>
      <motion.span
        className="ml-0.5 inline-block h-[0.9em] w-px bg-current"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ delay, duration: 0.8, repeat: Infinity, times: [0, 0.5, 1] }}
      />
    </span>
  );
}
