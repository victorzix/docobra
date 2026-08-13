"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";

const CX = 120;
const CZ = 90;
const CYAN = "#67e8f9";

const WALLS = [
  { x1: 10, y1: 10, x2: 230, y2: 10 },
  { x1: 230, y1: 10, x2: 230, y2: 170 },
  { x1: 230, y1: 170, x2: 10, y2: 170 },
  { x1: 10, y1: 170, x2: 10, y2: 10 },
  { x1: 120, y1: 10, x2: 120, y2: 35 },
  { x1: 120, y1: 60, x2: 120, y2: 170 },
  { x1: 10, y1: 90, x2: 180, y2: 90 },
  { x1: 205, y1: 90, x2: 230, y2: 90 },
];

type Furniture =
  | { type: "rect"; x: number; y: number; width: number; height: number }
  | { type: "line"; x1: number; y1: number; x2: number; y2: number }
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "ellipse"; cx: number; cy: number; rx: number; ry: number };

const FURNITURE: Furniture[] = [
  { type: "rect", x: 16, y: 18, width: 16, height: 46 },
  { type: "line", x1: 16, y1: 33, x2: 32, y2: 33 },
  { type: "line", x1: 16, y1: 49, x2: 32, y2: 49 },
  { type: "rect", x: 40, y: 32, width: 18, height: 16 },
  { type: "rect", x: 145, y: 16, width: 48, height: 32 },
  { type: "rect", x: 150, y: 19, width: 38, height: 9 },
  { type: "rect", x: 16, y: 148, width: 98, height: 13 },
  { type: "circle", cx: 40, cy: 154.5, r: 4 },
  { type: "circle", cx: 55, cy: 154.5, r: 4 },
  { type: "rect", x: 90, y: 150, width: 16, height: 9 },
  { type: "rect", x: 198, y: 98, width: 15, height: 9 },
  { type: "ellipse", cx: 205.5, cy: 119, rx: 9, ry: 12 },
  { type: "rect", x: 133, y: 98, width: 22, height: 11 },
  { type: "circle", cx: 144, cy: 103.5, r: 3.5 },
];

type Point = [number, number, number];

function rectPoints(x: number, y: number, width: number, height: number): Point[] {
  const x0 = x - CX;
  const z0 = y - CZ;
  const x1 = x + width - CX;
  const z1 = y + height - CZ;
  return [
    [x0, 0, z0],
    [x1, 0, z0],
    [x1, 0, z1],
    [x0, 0, z1],
    [x0, 0, z0],
  ];
}

function ellipsePoints(cx: number, cy: number, rx: number, ry: number, segments = 28): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx - CX + Math.cos(a) * rx, 0, cy - CZ + Math.sin(a) * ry]);
  }
  return pts;
}

function furniturePoints(f: Furniture): Point[] {
  if (f.type === "rect") return rectPoints(f.x, f.y, f.width, f.height);
  if (f.type === "line")
    return [
      [f.x1 - CX, 0, f.y1 - CZ],
      [f.x2 - CX, 0, f.y2 - CZ],
    ];
  if (f.type === "circle") return ellipsePoints(f.cx, f.cy, f.r, f.r);
  return ellipsePoints(f.cx, f.cy, f.rx, f.ry);
}

function Plan() {
  const wallLines = useMemo(
    () => WALLS.map((w) => [[w.x1 - CX, 0, w.y1 - CZ], [w.x2 - CX, 0, w.y2 - CZ]] as Point[]),
    [],
  );
  const furnitureLines = useMemo(() => FURNITURE.map(furniturePoints), []);

  return (
    <group>
      {wallLines.map((pts, i) => (
        <Line key={`wall-${i}`} points={pts} color={CYAN} lineWidth={2} />
      ))}
      {furnitureLines.map((pts, i) => (
        <Line key={`furniture-${i}`} points={pts} color={CYAN} lineWidth={1} transparent opacity={0.75} />
      ))}
    </group>
  );
}

export function FloorScene3D() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2">
      <div className="min-h-0 w-full flex-1 cursor-grab active:cursor-grabbing">
        <Canvas
          gl={{ alpha: true, antialias: true }}
          camera={{ position: [170, 190, 210], fov: 32 }}
        >
          <Plan />
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate
            autoRotateSpeed={1.4}
            maxPolarAngle={Math.PI / 2.15}
            minPolarAngle={Math.PI / 4}
          />
        </Canvas>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="relative h-2 w-40">
          <span className="absolute inset-x-0 top-1/2 h-px bg-cyan-400/50" />
          <span className="absolute left-0 top-0 h-2 w-px bg-cyan-400/50" />
          <span className="absolute right-0 top-0 h-2 w-px bg-cyan-400/50" />
        </div>
        <span className="font-mono text-[11px] tracking-wide text-cyan-400/70">
          PLANTA BAIXA — ESC. 1:100
        </span>
        <span className="font-mono text-[10px] tracking-wide text-slate-500">
          arraste para girar
        </span>
      </div>
    </div>
  );
}
