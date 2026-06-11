import type { RoomObjectProceduralRenderProps } from "@3dspace/contracts";
import type { RefObject } from "react";
import type { Group } from "three";

/**
 * Procedural RoomObject renderer props: shared data fields from `@3dspace/contracts`
 * plus a client-only `exportRootRef` for deferred in-app `.glb` export (PLAN § 3.5).
 */
/**
 * Optional live-room hook for procedurals with their own interactions (e.g. the
 * dice-pair "Roll" button). `setParameters` syncs new template parameters to the
 * room (optimistic local apply + realtime broadcast); `canInteract` reflects the
 * object's touch policy and lock state for the local user.
 */
export type ProceduralInteraction = {
  canInteract: boolean;
  setParameters(parameters: Record<string, unknown>): void;
};

export type ProceduralProps = RoomObjectProceduralRenderProps & {
  /**
   * Ref to the single `<group>` holding every exportable mesh.
   * `RoomObjectMesh` owns the ref on its scaled export root; the dev harness attaches it on a wrapper.
   */
  exportRootRef?: RefObject<Group | null>;
  /** Absent outside a live room (dev harness, previews) — interactive UI should hide itself. */
  interaction?: ProceduralInteraction;
};
