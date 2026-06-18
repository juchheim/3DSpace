"use client";

import { Html } from "@react-three/drei";

type LightGlyphProps = {
  position: { x: number; y: number; z: number };
  color: string;
  type: "point" | "spot" | "area";
  selected: boolean;
  enabled: boolean;
  onClick: () => void;
};

const TYPE_ICONS: Record<"point" | "spot" | "area", string> = {
  point: "●",
  spot: "◉",
  area: "▣",
};

export function LightGlyph({ position, color, type, selected, enabled, onClick }: LightGlyphProps) {
  const pos: [number, number, number] = [position.x, position.y, position.z];

  return (
    <Html position={pos} center style={{ pointerEvents: "none" }}>
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          console.info("[3DSpace pointer]", {
            action: "light-glyph-pointerdown",
            target: `${type}-light-glyph`,
            position,
            x: Math.round(e.clientX),
            y: Math.round(e.clientY)
          });
        }}
        onClick={(e) => {
          e.stopPropagation();
          console.info("[3DSpace pointer]", {
            action: "light-glyph-click",
            target: `${type}-light-glyph`,
            position,
            x: Math.round(e.clientX),
            y: Math.round(e.clientY)
          });
          onClick();
        }}
        title={`${type} light`}
        style={{
          pointerEvents: "auto",
          cursor: "pointer",
          width: 20,
          height: 20,
          borderRadius: "50%",
          backgroundColor: enabled ? color : color,
          opacity: enabled ? 1 : 0.4,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#000",
          userSelect: "none",
          boxSizing: "border-box",
          border: selected ? `2px solid #fff` : "1px solid rgba(0,0,0,0.4)",
          boxShadow: selected ? `0 0 0 2px ${color}` : "none",
          transition: "box-shadow 0.1s, border 0.1s",
        }}
      >
        {TYPE_ICONS[type]}
      </div>
    </Html>
  );
}
