"use client";

import { useEffect, useRef } from "react";
import { createDrawable, createScope, createTimeline, onScroll, stagger, type Scope } from "animejs";

const WALLS = [
  { key: "top", x1: 10, y1: 10, x2: 230, y2: 10 },
  { key: "right", x1: 230, y1: 10, x2: 230, y2: 170 },
  { key: "bottom", x1: 230, y1: 170, x2: 10, y2: 170 },
  { key: "left", x1: 10, y1: 170, x2: 10, y2: 10 },
  { key: "div-v-a", x1: 120, y1: 10, x2: 120, y2: 35 },
  { key: "div-v-b", x1: 120, y1: 60, x2: 120, y2: 170 },
  { key: "div-h-a", x1: 10, y1: 90, x2: 180, y2: 90 },
  { key: "div-h-b", x1: 205, y1: 90, x2: 230, y2: 90 },
];

const ROOMS = [
  { key: "sala", x: 98, y: 84, label: "SALA" },
  { key: "quarto", x: 175, y: 72, label: "QUARTO" },
  { key: "cozinha", x: 65, y: 112, label: "COZINHA" },
  { key: "banho", x: 175, y: 148, label: "BANHO" },
];

type Furniture =
  | { key: string; type: "rect"; x: number; y: number; width: number; height: number }
  | { key: string; type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { key: string; type: "circle"; cx: number; cy: number; r: number }
  | { key: string; type: "ellipse"; cx: number; cy: number; rx: number; ry: number };

const FURNITURE: Furniture[] = [
  { key: "sofa-body", type: "rect", x: 16, y: 18, width: 16, height: 46 },
  { key: "sofa-seam-1", type: "line", x1: 16, y1: 33, x2: 32, y2: 33 },
  { key: "sofa-seam-2", type: "line", x1: 16, y1: 49, x2: 32, y2: 49 },
  { key: "mesa-centro", type: "rect", x: 40, y: 32, width: 18, height: 16 },
  { key: "cama-corpo", type: "rect", x: 145, y: 16, width: 48, height: 32 },
  { key: "cama-travesseiro", type: "rect", x: 150, y: 19, width: 38, height: 9 },
  { key: "bancada", type: "rect", x: 16, y: 148, width: 98, height: 13 },
  { key: "fogao-1", type: "circle", cx: 40, cy: 154.5, r: 4 },
  { key: "fogao-2", type: "circle", cx: 55, cy: 154.5, r: 4 },
  { key: "pia-cozinha", type: "rect", x: 90, y: 150, width: 16, height: 9 },
  { key: "vaso-tanque", type: "rect", x: 198, y: 98, width: 15, height: 9 },
  { key: "vaso-bacia", type: "ellipse", cx: 205.5, cy: 119, rx: 9, ry: 12 },
  { key: "pia-banho-bancada", type: "rect", x: 133, y: 98, width: 22, height: 11 },
  { key: "pia-banho-cuba", type: "circle", cx: 144, cy: 103.5, r: 3.5 },
];

export function ScrollScene() {
  const root = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<Scope | null>(null);

  useEffect(() => {
    scopeRef.current = createScope({ root }).add(() => {
      if (!root.current) return;
      const target = root.current;

      const walls = createDrawable(".wall");
      const furniture = createDrawable(".furniture");

      createTimeline({
        autoplay: onScroll({
          target,
          sync: true,
          enter: "top top",
          leave: "bottom top",
        }),
      })
        .add(walls, {
          draw: ["0 0", "0 1"],
          duration: 500,
          delay: stagger(110),
          ease: "inOutSine",
        })
        .add(
          furniture,
          { draw: ["0 0", "0 1"], duration: 350, delay: stagger(45), ease: "outQuad" },
          "-=100",
        )
        .add(".room-label", { opacity: [0, 1], duration: 300, delay: stagger(70) }, "-=150")
        .add(".scene-wrap", { rotateZ: [0, 340], duration: 900, ease: "linear" }, "-=100");
    });

    return () => scopeRef.current?.revert();
  }, []);

  return (
    <div ref={root} className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[220vh] w-full">
      <div className="sticky top-0 flex h-screen w-full items-center justify-center overflow-hidden">
        <div style={{ perspective: "1400px" }}>
          <div className="scene-wrap" style={{ transformStyle: "preserve-3d", transform: "rotateX(58deg)" }}>
            <svg width={280} height={200} viewBox="0 0 240 180" fill="none">
            {WALLS.map((w) => (
              <line
                key={w.key}
                className="wall"
                x1={w.x1}
                y1={w.y1}
                x2={w.x2}
                y2={w.y2}
                stroke="#67e8f9"
                strokeWidth={2}
                strokeLinecap="square"
              />
            ))}
            {FURNITURE.map((f) => {
              const props = {
                className: "furniture",
                stroke: "#67e8f9",
                strokeWidth: 1.25,
                strokeLinecap: "round" as const,
              };
              if (f.type === "rect") {
                return <rect key={f.key} {...props} x={f.x} y={f.y} width={f.width} height={f.height} />;
              }
              if (f.type === "line") {
                return <line key={f.key} {...props} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />;
              }
              if (f.type === "circle") {
                return <circle key={f.key} {...props} cx={f.cx} cy={f.cy} r={f.r} />;
              }
              return <ellipse key={f.key} {...props} cx={f.cx} cy={f.cy} rx={f.rx} ry={f.ry} />;
            })}
            {ROOMS.map((r) => (
              <text
                key={r.key}
                className="room-label opacity-0"
                x={r.x}
                y={r.y}
                textAnchor="middle"
                fill="#67e8f9"
                fillOpacity={0.75}
                fontSize={9}
                fontFamily="var(--font-geist-mono)"
                letterSpacing={0.5}
              >
                {r.label}
              </text>
            ))}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
