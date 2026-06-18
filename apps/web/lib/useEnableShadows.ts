import { useLayoutEffect, type RefObject } from "react";
import type { Mesh, Object3D } from "three";

/**
 * Marks every Mesh under `root` as a shadow caster + receiver so placed
 * geometry (build pieces, furniture objects) blocks point/spot light and
 * shows shadows on the floor. Without this, lights pass straight through.
 *
 * Runs in a layout effect with no dep array: re-applies after every render,
 * which matters because GLB models stream in async (Suspense resolves → the
 * parent re-renders) and their meshes only exist on a later pass.
 */
export function useEnableShadows(ref: RefObject<Object3D | null>): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.traverse((obj: Object3D) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
  });
}
