"use client";

import { useState } from "react";
import { WhiteboardSurface } from "../../../components/Whiteboard/WhiteboardSurface";
import type { WhiteboardBoardState, WhiteboardController } from "../../../lib/useWhiteboards";

const MOCK_OBJECT = {
  id: "dev-wb-1",
  roomId: "dev-room-1",
  title: "Whiteboard",
  type: "whiteboard" as const,
  displayName: "Whiteboard",
  wallId: "dev-wall-1",
  surfaceNormal: { x: 0, y: 0, z: 1 } as const,
  position: { x: 0, y: 0, z: 0 },
  widthM: 4,
  heightM: 2.5,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const MOCK_BOARD: WhiteboardBoardState = {
  strokes: [],
  clearVersion: 0,
  loading: false,
  error: null,
  inProgressRemote: {},
  remoteCursors: {},
};

const MOCK_CONTROLLER: WhiteboardController = {
  commitStroke: async (_objectId, payload) => ({
    ...payload,
    roomId: "dev-room-1",
    wallObjectId: "dev-wb-1",
    authorUserId: "dev-user",
    z: Date.now(),
    clearVersion: 0,
    createdAt: new Date().toISOString(),
  }),
  eraseStrokes: async () => {},
  clear: async () => {},
  publishStrokeDelta: () => {},
  publishCursor: () => {},
};

export default function WhiteboardHeroPage() {
  const [size, setSize] = useState({ w: 640, h: 400 });

  return (
    <div style={{ padding: 32, fontFamily: "sans-serif", background: "#1a1a1a", minHeight: "100vh" }}>
      <h2 style={{ color: "#fff", marginBottom: 16, fontSize: 14, fontWeight: 600, letterSpacing: "0.05em" }}>
        WHITEBOARD DEV HARNESS
      </h2>
      <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "center" }}>
        {([
          { label: "Small (320×200)", w: 320, h: 200 },
          { label: "Medium (640×400)", w: 640, h: 400 },
          { label: "Large (960×560)", w: 960, h: 560 },
        ] as const).map((s) => (
          <button
            key={s.label}
            onClick={() => setSize({ w: s.w, h: s.h })}
            style={{
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #555",
              background: size.w === s.w ? "#444" : "#222",
              color: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div
        style={{
          width: size.w,
          height: size.h,
          border: "2px solid #444",
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <WhiteboardSurface
          object={MOCK_OBJECT as any}
          board={MOCK_BOARD}
          controller={MOCK_CONTROLLER}
          currentUserId="dev-user"
          canManage
          canWrite
          interactive
        />
      </div>
      <p style={{ color: "#888", fontSize: 12, marginTop: 12 }}>
        Resize the board to test toolbar containment at different sizes.
      </p>
    </div>
  );
}
