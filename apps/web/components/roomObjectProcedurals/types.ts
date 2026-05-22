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
   * `Group | null` matches the return type of React 19's `useRef<Group>(null)`.
   */
  exportRootRef: RefObject<Group | null>;
};
