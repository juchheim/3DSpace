import type { RoomObjectProceduralRenderProps } from "@3dspace/contracts";
import type { RefObject } from "react";
import type { Group } from "three";

/**
 * Procedural RoomObject renderer props: shared data fields from `@3dspace/contracts`
 * plus a client-only `exportRootRef` for deferred in-app `.glb` export (PLAN § 3.5).
 */
export type ProceduralProps = RoomObjectProceduralRenderProps & {
  /**
   * Ref to the single `<group>` holding every exportable mesh.
   * `RoomObjectMesh` owns the ref on its scaled export root; the dev harness attaches it on a wrapper.
   */
  exportRootRef?: RefObject<Group | null>;
};
