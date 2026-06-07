import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const publicGlb = join(repoRoot, "apps/web/public/avatar-accessories/bowler-hat.glb");
const sourceGlb = join(repoRoot, "GLBs/bowler-hat.glb");

const ACCESSORY_MAX_FILE_BYTES = 8 * 1024 * 1024;
const ACCESSORY_MAX_TRIANGLES = 15_000;

function countDocumentTriangles(document: Awaited<ReturnType<NodeIO["readBinary"]>>) {
  return document.getRoot().listMeshes().reduce((total, mesh) => {
    return (
      total +
      mesh.listPrimitives().reduce((meshTotal, primitive) => {
        const positionAccessor = primitive.getAttribute("POSITION");
        if (!positionAccessor) return meshTotal;
        const indexCount = primitive.getIndices()?.getCount() ?? positionAccessor.getCount();
        const mode = primitive.getMode();
        if (mode === 4) return meshTotal + indexCount / 3;
        if (mode === 5) return meshTotal + Math.max(0, indexCount - 2);
        if (mode === 6) return meshTotal + Math.max(0, indexCount - 2);
        return meshTotal;
      }, 0)
    );
  }, 0);
}

describe("bowler-hat public GLB asset", () => {
  it("exists and matches the authoring source byte-for-byte", () => {
    expect(statSync(publicGlb).size).toBe(statSync(sourceGlb).size);
  });

  it("stays within accessory file-size and triangle budgets", async () => {
    const bytes = readFileSync(publicGlb);
    expect(bytes.byteLength).toBeLessThanOrEqual(ACCESSORY_MAX_FILE_BYTES);
    expect(bytes.byteLength).toBeGreaterThan(0);

    const io = new NodeIO();
    const document = await io.readBinary(bytes);
    const triangleCount = countDocumentTriangles(document);

    expect(triangleCount).toBeLessThanOrEqual(ACCESSORY_MAX_TRIANGLES);
    expect(triangleCount).toBeGreaterThan(0);
    expect(triangleCount).toBeLessThan(10_000);
  });
});
