import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCustomRoomObjectAsset } from "../../src/room-objects/custom-template-upload";

// The committed Sprocket-Bot host model (scripts/build-sprocket-bot-glb.mjs)
// doubles as a placeable room object. This guards that it always satisfies the
// same gate a user upload goes through, so it can be imported as an object.
const GLB_PATH = resolve(process.cwd(), "apps/web/public/world-hosts/sprocket-bot.glb");
const DEFAULT_MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // rooms-core/settings.ts default
const ROOM_OBJECT_MAX_TRIANGLES = 200_000; // custom-template-upload.ts budget

describe("Sprocket-Bot GLB import compatibility", () => {
  it("passes the custom room-object upload validator", async () => {
    const bytes = await readFile(GLB_PATH);
    const result = await validateCustomRoomObjectAsset({
      bytes,
      maxUploadSizeBytes: DEFAULT_MAX_UPLOAD_BYTES
    });

    expect(result.fileSizeBytes).toBe(bytes.byteLength);
    // Genuinely high-def but comfortably inside the triangle + file-size budgets.
    expect(result.triangleCount).toBeGreaterThan(20_000);
    expect(result.triangleCount).toBeLessThan(ROOM_OBJECT_MAX_TRIANGLES);
    expect(result.fileSizeBytes).toBeLessThan(DEFAULT_MAX_UPLOAD_BYTES);
  });
});
