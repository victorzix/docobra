"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Edges, Line, OrbitControls } from "@react-three/drei";
import { motion } from "framer-motion";
import type { Group } from "three";

import { Typewriter } from "./typewriter";

const CX = 120;
const CZ = 90;
const CYAN = "#67e8f9";
const WALL_HEIGHT = 24;
const WALL_THICKNESS = 3;
const WALL_STAGGER = 0.09;
const WALL_DURATION = 0.5;
const FURNITURE_STAGGER = 0.06;
const FURNITURE_DURATION = 0.35;

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

const WALLS_END = WALLS.length * WALL_STAGGER + WALL_DURATION;
const FURNITURE_COUNT = BOXES.length + CYLINDERS.length + ELLIPSES.length;
export const BUILD_END = WALLS_END + FURNITURE_COUNT * FURNITURE_STAGGER + FURNITURE_DURATION;

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/** Anchors its children to the ground and grows them upward on mount — the "poured foundation" effect. */
function Grow({
  x,
  z,
  delay,
  duration,
  children,
}: {
  x: number;
  z: number;
  delay: number;
  duration: number;
  children: React.ReactNode;
}) {
  const ref = useRef<Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime - delay) / duration;
    ref.current.scale.y = easeOutCubic(Math.min(Math.max(t, 0), 1));
  });

  return (
    <group ref={ref} position={[x, 0, z]} scale={[1, 0, 1]}>
      {children}
    </group>
  );
}

function WallMesh({ x1, y1, x2, y2, delay }: (typeof WALLS)[number] & { delay: number }) {
  const dx = x2 - x1;
  const dz = y2 - y1;
  const length = Math.hypot(dx, dz);
  const angle = Math.atan2(dz, dx);
  const midX = (x1 + x2) / 2 - CX;
  const midZ = (y1 + y2) / 2 - CZ;

  return (
    <Grow x={midX} z={midZ} delay={delay} duration={WALL_DURATION}>
      <mesh position={[0, WALL_HEIGHT / 2, 0]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[length, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.05} />
        <Edges color={CYAN} />
      </mesh>
    </Grow>
  );
}

function BoxMesh({ x, y, width, depth, height, lift = 0, delay }: Box & { delay: number }) {
  return (
    <Grow x={x + width / 2 - CX} z={y + depth / 2 - CZ} delay={delay} duration={FURNITURE_DURATION}>
      <mesh position={[0, lift + height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.08} />
        <Edges color={CYAN} />
      </mesh>
    </Grow>
  );
}

function CylinderMesh({ cx, cy, r, height, lift = 0, delay }: Cyl & { delay: number }) {
  return (
    <Grow x={cx - CX} z={cy - CZ} delay={delay} duration={FURNITURE_DURATION}>
      <mesh position={[0, lift + height / 2, 0]}>
        <cylinderGeometry args={[r, r, height, 20]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.08} />
        <Edges color={CYAN} />
      </mesh>
    </Grow>
  );
}

function EllipseMesh({ cx, cy, rx, ry, height, lift = 0, delay }: Ellip & { delay: number }) {
  const r = (rx + ry) / 2;
  return (
    <Grow x={cx - CX} z={cy - CZ} delay={delay} duration={FURNITURE_DURATION}>
      <mesh position={[0, lift + height / 2, 0]} scale={[rx / r, 1, ry / r]}>
        <cylinderGeometry args={[r, r, height, 24]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.08} />
        <Edges color={CYAN} />
      </mesh>
    </Grow>
  );
}

const DIM_MARGIN = 18;
const BX0 = 10 - CX;
const BX1 = 230 - CX;
const BZ0 = 10 - CZ;
const BZ1 = 170 - CZ;
const DIM_COLOR = "#a5f3fc";

/** Uniformly scales its children in the ground plane from their anchor point outward — a "ruler being pulled out" reveal. */
function GrowFlat({
  x,
  z,
  delay,
  duration,
  children,
}: {
  x: number;
  z: number;
  delay: number;
  duration: number;
  children: React.ReactNode;
}) {
  const ref = useRef<Group>(null);

  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime - delay) / duration;
    const s = easeOutCubic(Math.min(Math.max(t, 0), 1));
    ref.current.scale.set(s, 1, s);
  });

  return (
    <group ref={ref} position={[x, 0, z]} scale={[0, 1, 0]}>
      {children}
    </group>
  );
}

function ArrowHead({
  x,
  z,
  rotation,
}: {
  x: number;
  z: number;
  rotation: [number, number, number];
}) {
  return (
    <mesh position={[x, 0, z]} rotation={rotation}>
      <coneGeometry args={[1.6, 5, 10]} />
      <meshBasicMaterial color={DIM_COLOR} transparent opacity={0.55} />
    </mesh>
  );
}

/** A pencil-drawn-looking architectural dimension line: extension ticks + arrowed span. */
function DimensionLine({
  axis,
  spanFrom,
  spanTo,
  lineCoord,
  edgeCoord,
  delay,
}: {
  axis: "x" | "z";
  /** World coordinate range along the varying axis. */
  spanFrom: number;
  spanTo: number;
  /** World coordinate of the dimension line itself, on the fixed (perpendicular) axis. */
  lineCoord: number;
  /** World coordinate of the building edge, on that same fixed axis — where the extension ticks land. */
  edgeCoord: number;
  delay: number;
}) {
  const mid = (spanFrom + spanTo) / 2;
  const half = (spanTo - spanFrom) / 2;
  const edgeDelta = edgeCoord - lineCoord;

  const anchorX = axis === "x" ? mid : lineCoord;
  const anchorZ = axis === "x" ? lineCoord : mid;

  // Relative coordinates, in the child's own frame (origin at the dimension line's midpoint).
  const p1: [number, number, number] = axis === "x" ? [-half, 0, 0] : [0, 0, -half];
  const p2: [number, number, number] = axis === "x" ? [half, 0, 0] : [0, 0, half];
  const edge1: [number, number, number] = axis === "x" ? [-half, 0, edgeDelta] : [edgeDelta, 0, -half];
  const edge2: [number, number, number] = axis === "x" ? [half, 0, edgeDelta] : [edgeDelta, 0, half];
  const arrowRot1: [number, number, number] = axis === "x" ? [0, 0, Math.PI / 2] : [-Math.PI / 2, 0, 0];
  const arrowRot2: [number, number, number] = axis === "x" ? [0, 0, -Math.PI / 2] : [Math.PI / 2, 0, 0];

  return (
    <GrowFlat x={anchorX} z={anchorZ} delay={delay} duration={0.6}>
      <Line points={[p1, p2]} color={DIM_COLOR} lineWidth={1} transparent opacity={0.55} />
      <Line points={[p1, edge1]} color={DIM_COLOR} lineWidth={1} transparent opacity={0.35} />
      <Line points={[p2, edge2]} color={DIM_COLOR} lineWidth={1} transparent opacity={0.35} />
      <ArrowHead x={p1[0]} z={p1[2]} rotation={arrowRot1} />
      <ArrowHead x={p2[0]} z={p2[2]} rotation={arrowRot2} />
    </GrowFlat>
  );
}

function Dimensions() {
  return (
    <>
      <DimensionLine
        axis="x"
        spanFrom={BX0}
        spanTo={BX1}
        lineCoord={BZ1 + DIM_MARGIN}
        edgeCoord={BZ1}
        delay={BUILD_END}
      />
      <DimensionLine
        axis="z"
        spanFrom={BZ0}
        spanTo={BZ1}
        lineCoord={BX0 - DIM_MARGIN}
        edgeCoord={BX0}
        delay={BUILD_END + 0.25}
      />
    </>
  );
}

function Plan() {
  return (
    <group>
      {WALLS.map((w, i) => (
        <WallMesh key={`wall-${i}`} {...w} delay={i * WALL_STAGGER} />
      ))}
      {BOXES.map(({ key, ...b }, i) => (
        <BoxMesh key={key} {...b} delay={WALLS_END + i * FURNITURE_STAGGER} />
      ))}
      {CYLINDERS.map(({ key, ...c }, i) => (
        <CylinderMesh
          key={key}
          {...c}
          delay={WALLS_END + (BOXES.length + i) * FURNITURE_STAGGER}
        />
      ))}
      {ELLIPSES.map(({ key, ...e }, i) => (
        <EllipseMesh
          key={key}
          {...e}
          delay={WALLS_END + (BOXES.length + CYLINDERS.length + i) * FURNITURE_STAGGER}
        />
      ))}
      <Dimensions />
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
            rotateSpeed={0.20}
            maxPolarAngle={Math.PI / 2.15}
            minPolarAngle={Math.PI / 4}
          />
        </Canvas>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1">
        <div className="relative h-2 w-40 origin-center">
          <motion.span
            className="absolute inset-x-0 top-1/2 h-px origin-center bg-cyan-400/50"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: BUILD_END, duration: 0.4, ease: "easeOut" }}
          />
          <motion.span
            className="absolute left-0 top-0 h-2 w-px bg-cyan-400/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: BUILD_END + 0.4, duration: 0.2 }}
          />
          <motion.span
            className="absolute right-0 top-0 h-2 w-px bg-cyan-400/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: BUILD_END + 0.4, duration: 0.2 }}
          />
        </div>
        <Typewriter
          text="PLANTA BAIXA — ESC. 1:100"
          delay={BUILD_END + 0.5}
          duration={1.1}
          className="font-mono text-[11px] tracking-wide text-cyan-400/70"
        />
        <Typewriter
          text="arraste para girar"
          delay={BUILD_END + 1.8}
          duration={0.6}
          className="font-mono text-[10px] tracking-wide text-slate-500"
        />
      </div>
    </div>
  );
}
