"use client";

import { Canvas } from "@react-three/fiber";
import { Edges, OrbitControls } from "@react-three/drei";

const CX = 120;
const CZ = 90;
const CYAN = "#67e8f9";
const WALL_HEIGHT = 24;
const WALL_THICKNESS = 3;

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

type Box = { key: string; x: number; y: number; width: number; depth: number; height: number; lift?: number };
type Cyl = { key: string; cx: number; cy: number; r: number; height: number; lift?: number };
type Ellip = { key: string; cx: number; cy: number; rx: number; ry: number; height: number; lift?: number };

const BOXES: Box[] = [
  // sofá (sala)
  { key: "sofa", x: 16, y: 18, width: 16, depth: 46, height: 14 },
  { key: "mesa-centro", x: 40, y: 32, width: 18, depth: 16, height: 10 },
  // cama (quarto)
  { key: "cama", x: 145, y: 16, width: 48, depth: 32, height: 12 },
  { key: "travesseiro", x: 150, y: 19, width: 38, depth: 9, height: 4, lift: 12 },
  // cozinha
  { key: "bancada", x: 16, y: 148, width: 98, depth: 13, height: 10 },
  { key: "pia-cozinha", x: 90, y: 150, width: 16, depth: 9, height: 12 },
  // banheiro
  { key: "vaso-tanque", x: 198, y: 98, width: 15, depth: 9, height: 18 },
  { key: "pia-banho", x: 133, y: 98, width: 22, depth: 11, height: 8 },
];

const CYLINDERS: Cyl[] = [
  { key: "fogao-1", cx: 40, cy: 154.5, r: 4, height: 11 },
  { key: "fogao-2", cx: 55, cy: 154.5, r: 4, height: 11 },
  { key: "cuba-banho", cx: 144, cy: 103.5, r: 3.5, height: 3, lift: 8 },
];

const ELLIPSES: Ellip[] = [{ key: "vaso-bacia", cx: 205.5, cy: 119, rx: 9, ry: 12, height: 14 }];

function WallMesh({ x1, y1, x2, y2 }: (typeof WALLS)[number]) {
  const dx = x2 - x1;
  const dz = y2 - y1;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (x1 + x2) / 2 - CX;
  const midZ = (y1 + y2) / 2 - CZ;

  return (
    <mesh position={[midX, WALL_HEIGHT / 2, midZ]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, WALL_HEIGHT, WALL_THICKNESS]} />
      <meshBasicMaterial color={CYAN} transparent opacity={0.05} />
      <Edges color={CYAN} />
    </mesh>
  );
}

function BoxMesh({ x, y, width, depth, height, lift = 0 }: Box) {
  return (
    <mesh position={[x + width / 2 - CX, lift + height / 2, y + depth / 2 - CZ]}>
      <boxGeometry args={[width, height, depth]} />
      <meshBasicMaterial color={CYAN} transparent opacity={0.08} />
      <Edges color={CYAN} />
    </mesh>
  );
}

function CylinderMesh({ cx, cy, r, height, lift = 0 }: Cyl) {
  return (
    <mesh position={[cx - CX, lift + height / 2, cy - CZ]}>
      <cylinderGeometry args={[r, r, height, 20]} />
      <meshBasicMaterial color={CYAN} transparent opacity={0.08} />
      <Edges color={CYAN} />
    </mesh>
  );
}

function EllipseMesh({ cx, cy, rx, ry, height, lift = 0 }: Ellip) {
  const r = (rx + ry) / 2;
  return (
    <mesh
      position={[cx - CX, lift + height / 2, cy - CZ]}
      scale={[rx / r, 1, ry / r]}
    >
      <cylinderGeometry args={[r, r, height, 24]} />
      <meshBasicMaterial color={CYAN} transparent opacity={0.08} />
      <Edges color={CYAN} />
    </mesh>
  );
}

function Plan() {
  return (
    <group>
      {WALLS.map((w, i) => (
        <WallMesh key={`wall-${i}`} {...w} />
      ))}
      {BOXES.map(({ key, ...b }) => (
        <BoxMesh key={key} {...b} />
      ))}
      {CYLINDERS.map(({ key, ...c }) => (
        <CylinderMesh key={key} {...c} />
      ))}
      {ELLIPSES.map(({ key, ...e }) => (
        <EllipseMesh key={key} {...e} />
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
