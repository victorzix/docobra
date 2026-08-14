"use client";

import { useEffect, useRef, useState } from "react";
import { animate, createDrawable, createScope, createTimeline, stagger, type Scope } from "animejs";

const DRAG_SENSITIVITY = 0.4;
const SPIN_DURATION = 26000;

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
  // sofá (sala, encostado na parede esquerda)
  { key: "sofa-body", type: "rect", x: 16, y: 18, width: 16, height: 46 },
  { key: "sofa-seam-1", type: "line", x1: 16, y1: 33, x2: 32, y2: 33 },
  { key: "sofa-seam-2", type: "line", x1: 16, y1: 49, x2: 32, y2: 49 },
  { key: "mesa-centro", type: "rect", x: 40, y: 32, width: 18, height: 16 },
  // cama (quarto, encostada na parede de cima)
  { key: "cama-corpo", type: "rect", x: 145, y: 16, width: 48, height: 32 },
  { key: "cama-travesseiro", type: "rect", x: 150, y: 19, width: 38, height: 9 },
  // cozinha: bancada + fogão + pia
  { key: "bancada", type: "rect", x: 16, y: 148, width: 98, height: 13 },
  { key: "fogao-1", type: "circle", cx: 40, cy: 154.5, r: 4 },
  { key: "fogao-2", type: "circle", cx: 55, cy: 154.5, r: 4 },
  { key: "pia-cozinha", type: "rect", x: 90, y: 150, width: 16, height: 9 },
  // banheiro: vaso + pia
  { key: "vaso-tanque", type: "rect", x: 198, y: 98, width: 15, height: 9 },
  { key: "vaso-bacia", type: "ellipse", cx: 205.5, cy: 119, rx: 9, ry: 12 },
  { key: "pia-banho-bancada", type: "rect", x: 133, y: 98, width: 22, height: 11 },
  { key: "pia-banho-cuba", type: "circle", cx: 144, cy: 103.5, r: 3.5 },
];

export function FloorScene() {
  const root = useRef<HTMLDivElement>(null);
  const dragLayer = useRef<HTMLDivElement>(null);
  const scopeRef = useRef<Scope | null>(null);
  const dragState = useRef({ active: false, startX: 0, baseAngle: 0, angle: 0 });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    scopeRef.current = createScope({ root }).add(() => {
      const startSpin = () => {
        animate(".spin", {
          rotateZ: 360,
          duration: SPIN_DURATION,
          ease: "linear",
          loop: true,
        });
      };

      const walls = createDrawable(".wall");
      const furniture = createDrawable(".furniture");

      createTimeline({ onComplete: startSpin })
        .add(walls, {
          draw: ["0 0", "0 1"],
          duration: 500,
          delay: stagger(110),
          ease: "inOutSine",
        })
        .add(
          furniture,
          {
            draw: ["0 0", "0 1"],
            duration: 350,
            delay: stagger(45),
            ease: "outQuad",
          },
          "-=100",
        )
        .add(
          ".room-label",
          { opacity: [0, 1], duration: 300, delay: stagger(70) },
          "-=150",
        )
        .add(
          ".dimension-line",
          { scaleX: [0, 1], opacity: [0, 1], duration: 450, ease: "outQuad" },
          "-=150",
        )
        .add(".dimension-label", { opacity: [0, 1], translateY: [4, 0], duration: 350 }, "-=150")
        .add(".drag-hint", { opacity: [0, 1], duration: 350 });
    });

    return () => scopeRef.current?.revert();
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer may already be inactive (e.g. released before this handler ran)
    }
    dragState.current.active = true;
    dragState.current.startX = e.clientX;
    dragState.current.baseAngle = dragState.current.angle;
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current.active || !dragLayer.current) return;
    const delta = (e.clientX - dragState.current.startX) * DRAG_SENSITIVITY;
    dragState.current.angle = dragState.current.baseAngle + delta;
    dragLayer.current.style.transform = `rotateZ(${dragState.current.angle}deg)`;
  }

  function endDrag() {
    dragState.current.active = false;
    setDragging(false);
  }

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        className={`flex min-h-0 w-full flex-1 touch-none select-none items-center justify-center ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        style={{ perspective: "1400px" }}
      >
        <div style={{ transformStyle: "preserve-3d", transform: "rotateX(58deg)" }}>
          <div className="spin relative" style={{ transformStyle: "preserve-3d" }}>
            <div ref={dragLayer} className="relative" style={{ transformStyle: "preserve-3d" }}>
              <svg width={220} height={160} viewBox="0 0 240 180" fill="none">
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
                    key: f.key,
                    className: "furniture",
                    stroke: "#67e8f9",
                    strokeWidth: 1.25,
                    strokeLinecap: "round" as const,
                  };
                  if (f.type === "rect") {
                    return <rect {...props} x={f.x} y={f.y} width={f.width} height={f.height} />;
                  }
                  if (f.type === "line") {
                    return <line {...props} x1={f.x1} y1={f.y1} x2={f.x2} y2={f.y2} />;
                  }
                  if (f.type === "circle") {
                    return <circle {...props} cx={f.cx} cy={f.cy} r={f.r} />;
                  }
                  return <ellipse {...props} cx={f.cx} cy={f.cy} rx={f.rx} ry={f.ry} />;
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

      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="dimension-line relative h-2 w-40 origin-center opacity-0">
          <span className="absolute inset-x-0 top-1/2 h-px bg-cyan-400/50" />
          <span className="absolute left-0 top-0 h-2 w-px bg-cyan-400/50" />
          <span className="absolute right-0 top-0 h-2 w-px bg-cyan-400/50" />
        </div>
        <span className="dimension-label font-mono text-[11px] tracking-wide text-cyan-400/70 opacity-0">
          PLANTA BAIXA — ESC. 1:100
        </span>
        <span className="drag-hint font-mono text-[10px] tracking-wide text-slate-500 opacity-0">
          arraste para girar
        </span>
      </div>
    </div>
  );
}
