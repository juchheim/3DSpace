"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { type Group, type Mesh } from "three";
import { RetroRobotHostAvatar } from "./RetroRobotHostAvatar";

/**
 * Dev-only authoring harness for the AI World Host's RetroRobotHostAvatar. No
 * LiveKit, no room, no API — just the procedural avatar, orbit controls, and the
 * animation-state toggles so the retro-robot read and motion can be signed off
 * before the host CRUD UI exists. Route: /dev/ai-host-hero (next dev only).
 */

type StateName = "idle" | "thinking" | "speaking";

function countTriangles(root: Group | null): number {
  if (!root) return 0;
  let total = 0;
  root.traverse((object) => {
    if (object.type !== "Mesh") return;
    const geometry = (object as Mesh).geometry;
    if (!geometry) return;
    if (geometry.index) total += geometry.index.count / 3;
    else {
      const position = geometry.getAttribute("position");
      if (position) total += position.count / 3;
    }
  });
  return Math.round(total);
}

function TriangleProbe({ onMeasure }: { onMeasure: (count: number) => void }) {
  const scene = useThree((state) => state.scene);
  useEffect(() => {
    const frame = requestAnimationFrame(() => onMeasure(countTriangles(scene as unknown as Group)));
    return () => cancelAnimationFrame(frame);
  }, [scene, onMeasure]);
  return null;
}

const PRESET_BUBBLES = [
  "",
  "Press 3 to place a Ramp, then drag to paint a row.",
  "Undo is ⌘Z (Ctrl+Z on Windows). Redo is ⇧⌘Z."
];

export function RetroRobotHostHarness() {
  const [animState, setAnimState] = useState<StateName>("idle");
  const [ghost, setGhost] = useState(false);
  const [bubbleIndex, setBubbleIndex] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [triangles, setTriangles] = useState(0);
  const lastClick = useRef<string>("—");
  const [clickLabel, setClickLabel] = useState("—");

  useEffect(() => {
    lastClick.current = clickLabel;
  }, [clickLabel]);

  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", background: "#0c1118", color: "#e8eef6", fontFamily: "Trebuchet MS, sans-serif" }}>
      <aside style={{ width: 280, padding: "1.2rem", borderRight: "1px solid #1e2836", display: "flex", flexDirection: "column", gap: "1rem", overflowY: "auto" }}>
        <div>
          <p style={{ margin: 0, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.6 }}>AI World Host · Phase 3</p>
          <h1 style={{ margin: "0.2rem 0 0", fontSize: "1.25rem" }}>RetroRobotHostAvatar</h1>
        </div>

        <section style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7, margin: 0 }}>Animation state</h2>
          <div style={{ display: "flex", gap: "0.4rem" }}>
            {(["idle", "thinking", "speaking"] as const).map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => setAnimState(name)}
                style={{
                  flex: 1,
                  padding: "0.45rem 0.2rem",
                  borderRadius: 8,
                  border: "1px solid #2b3a4d",
                  background: animState === name ? "#3ECFCC" : "#141d28",
                  color: animState === name ? "#06222a" : "#cdd7e3",
                  fontWeight: 600,
                  cursor: "pointer",
                  textTransform: "capitalize"
                }}
              >
                {name}
              </button>
            ))}
          </div>
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <h2 style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7, margin: 0 }}>Speech bubble</h2>
          {PRESET_BUBBLES.map((text, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setBubbleIndex(index)}
              style={{
                textAlign: "left",
                padding: "0.4rem 0.55rem",
                borderRadius: 8,
                border: "1px solid #2b3a4d",
                background: bubbleIndex === index ? "#22384a" : "#141d28",
                color: "#cdd7e3",
                cursor: "pointer",
                fontSize: "0.78rem"
              }}
            >
              {text === "" ? "(none)" : text}
            </button>
          ))}
        </section>

        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={ghost} onChange={(e) => setGhost(e.target.checked)} />
          Placement ghost
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem" }}>
          <input type="checkbox" checked={autoRotate} onChange={(e) => setAutoRotate(e.target.checked)} />
          Auto-rotate camera
        </label>

        <div style={{ marginTop: "auto", fontSize: "0.78rem", opacity: 0.75, lineHeight: 1.5 }}>
          <div>~{triangles.toLocaleString()} triangles</div>
          <div>Last click: {clickLabel}</div>
        </div>
      </aside>

      <div style={{ flex: 1, position: "relative" }}>
        <Canvas
          camera={{ position: [2.0, 1.7, 3.0], fov: 42 }}
          dpr={[1, 2]}
          gl={{ antialias: true, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#0e151f"]} />
          <hemisphereLight args={["#cfe0ff", "#1a1712", 0.55]} />
          <directionalLight position={[4, 7, 5]} intensity={2.3} color="#fff4e6" castShadow />
          <directionalLight position={[-5, 3, -2]} intensity={0.8} color="#9fc0ff" />
          <directionalLight position={[0, 2, -6]} intensity={0.7} />

          <RetroRobotHostAvatar
            position={{ x: 0, y: 0, z: 0 }}
            rotationY={0}
            displayName="Chip"
            thinking={animState === "thinking"}
            speaking={animState === "speaking"}
            bubbleText={PRESET_BUBBLES[bubbleIndex] ?? null}
            ghost={ghost}
            onInteract={() => setClickLabel(new Date().toLocaleTimeString())}
          />

          <Grid
            args={[20, 20]}
            cellSize={0.5}
            cellColor="#243244"
            sectionSize={2}
            sectionColor="#33506b"
            position={[0, 0.001, 0]}
            infiniteGrid
            fadeDistance={26}
          />
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            autoRotate={autoRotate}
            autoRotateSpeed={0.7}
            minDistance={1.6}
            maxDistance={9}
            maxPolarAngle={Math.PI * 0.92}
            target={[0, 1.0, 0]}
          />
          <TriangleProbe onMeasure={setTriangles} />
        </Canvas>
      </div>
    </div>
  );
}
