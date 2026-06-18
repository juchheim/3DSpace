import { useLayoutEffect, type RefObject } from "react";
import type { Mesh, Object3D } from "three";

/**
 * Marks every Mesh under `root` as a shadow caster + receiver so placed
 * geometry blocks point/spot light and shows shadows on the floor. Without
 * this, lights pass straight through.
 */
export function applyShadows(root: Object3D): void {
  root.traverse((obj: Object3D) => {
    const mesh = obj as Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
}

/**
 * Hook form for groups of *synchronously*-rendered meshes (declarative R3F
 * geometry). Runs in a layout effect after every render.
 *
 * NOTE: this does NOT reliably reach GLB meshes loaded under Suspense — when a
 * suspended child resolves, React re-renders from the Suspense boundary down,
 * not necessarily this parent. Call {@link applyShadows} on the cloned scene
 * inside the loader component for GLBs instead.
 */
export function useEnableShadows(ref: RefObject<Object3D | null>): void {
  useLayoutEffect(() => {
    const root = ref.current;
    if (root) applyShadows(root);
  });
}
