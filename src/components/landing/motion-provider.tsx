"use client";

import { MotionConfig } from "framer-motion";

// O default do framer-motion é reducedMotion: "never", então nem os blobs em
// loop infinito nem as entradas em whileInView respeitariam a preferência do SO
// sem isso. Cobre todas as seções animadas da landing de uma vez.
export function LandingMotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
