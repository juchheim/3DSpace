import { describe, it, expect } from "vitest";
import {
  RoomLightSchema,
  RoomEnvironmentSchema,
  defaultRoomEnvironment,
  ROOM_LIGHT_MAX_PER_ROOM,
} from "../src/lighting.js";

describe("RoomLightSchema", () => {
  const base = {
    id: "l1",
    roomId: "r1",
    type: "point" as const,
    position: { x: 0, y: 2, z: 0 },
    color: "#ffffff",
    intensity: 1,
    createdByUserId: "u1",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-01T00:00:00.000Z",
  };

  it("parses a valid point light", () => {
    expect(() => RoomLightSchema.parse(base)).not.toThrow();
  });

  it("parses a valid spot light", () => {
    expect(() =>
      RoomLightSchema.parse({ ...base, type: "spot", target: { x: 0, y: 0, z: 0 }, angleDeg: 30 })
    ).not.toThrow();
  });

  it("rejects spot light without target", () => {
    expect(() => RoomLightSchema.parse({ ...base, type: "spot", angleDeg: 30 })).toThrow();
  });

  it("rejects area light with castShadow=true", () => {
    expect(() =>
      RoomLightSchema.parse({ ...base, type: "area", castShadow: true, width: 1, height: 1 })
    ).toThrow();
  });

  it("rejects area light without width/height", () => {
    expect(() => RoomLightSchema.parse({ ...base, type: "area" })).toThrow();
  });

  it("rejects invalid hex color", () => {
    expect(() => RoomLightSchema.parse({ ...base, color: "red" })).toThrow();
  });

  it("rejects intensity above cap", () => {
    expect(() => RoomLightSchema.parse({ ...base, intensity: 999 })).toThrow();
  });
});

describe("RoomEnvironmentSchema", () => {
  it("parses empty object with defaults", () => {
    const env = RoomEnvironmentSchema.parse({});
    expect(env.enabled).toBe(false);
    expect(env.exposure.toneMapping).toBe("none");
  });

  it("defaultRoomEnvironment() returns valid object", () => {
    expect(() => RoomEnvironmentSchema.parse(defaultRoomEnvironment())).not.toThrow();
  });
});

describe("constants", () => {
  it("ROOM_LIGHT_MAX_PER_ROOM is 64", () => {
    expect(ROOM_LIGHT_MAX_PER_ROOM).toBe(64);
  });
});
