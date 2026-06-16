"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PhysicsTuning, RoomSessionResponse, WorldSkinDayNightMode } from "@3dspace/contracts";
import { parseRoomSettings } from "@3dspace/contracts";
import { patchRoom } from "../api";
import type { ApiIdentity } from "../identity";
import type { RealtimeMessage } from "../realtime";

type UseRoomEnvironmentActionsInput = {
  identity: ApiIdentity;
  roomId?: string | undefined;
  worldSkinSettings:
    | {
        enabled?: boolean | undefined;
        skinId?: string | null | undefined;
        skinDayNightMode?: WorldSkinDayNightMode | undefined;
        ambientGainOverride?: number | null | undefined;
      }
    | undefined;
  setSession: Dispatch<SetStateAction<RoomSessionResponse | null>>;
  setTargetSkinId(nextSkinId: string | null): void;
  setTargetDayNightMode(mode: WorldSkinDayNightMode): void;
  publishRealtime(message: RealtimeMessage): void;
  runClassroomAction(action: { type: string; [key: string]: unknown }): Promise<unknown>;
};

export function useRoomEnvironmentActions({
  identity,
  roomId,
  worldSkinSettings,
  setSession,
  setTargetSkinId,
  setTargetDayNightMode,
  publishRealtime,
  runClassroomAction
}: UseRoomEnvironmentActionsInput) {
  const [localAmbientGain, setLocalAmbientGain] = useState<number | null>(null);
  const ambientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const physicsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const physicsPatchGenerationRef = useRef(0);

  const runSkinAction = useCallback(
    async (action: { type: string; [key: string]: unknown }) => {
      const result = await runClassroomAction(action);
      if (action.type === "set-room-skin") {
        setTargetSkinId((action.skinId as string | null | undefined) ?? null);
      }
      if (action.type === "set-room-skin-day-night") {
        setTargetDayNightMode((action.mode as WorldSkinDayNightMode | undefined) ?? "day");
      }
      const messages = (result as { realtimeMessages?: RealtimeMessage[] }).realtimeMessages ?? [];
      for (const message of messages) publishRealtime(message);
      return result;
    },
    [publishRealtime, runClassroomAction, setTargetDayNightMode, setTargetSkinId]
  );

  const changeAmbientGain = useCallback(
    (gain: number) => {
      if (!roomId) return;
      setLocalAmbientGain(gain);
      if (ambientDebounceRef.current) clearTimeout(ambientDebounceRef.current);
      ambientDebounceRef.current = setTimeout(() => {
        void patchRoom(identity, roomId, {
          settings: {
            worldSkins: {
              enabled: worldSkinSettings?.enabled ?? true,
              skinId: worldSkinSettings?.skinId ?? null,
              skinDayNightMode: worldSkinSettings?.skinDayNightMode ?? "day",
              ambientGainOverride: gain
            }
          }
        });
      }, 400);
    },
    [identity, roomId, worldSkinSettings]
  );

  const persistRoomPhysicsSettings = useCallback(
    (nextPhysics: Partial<PhysicsTuning>) => {
      if (!roomId) return;
      const generation = ++physicsPatchGenerationRef.current;
      void patchRoom(identity, roomId, {
        settings: {
          physics: nextPhysics
        }
      })
        .then((updated) => {
          if (physicsPatchGenerationRef.current !== generation) return;
          const nextSettings = parseRoomSettings(updated.settings);
          setSession((current) =>
            current?.room.id === roomId
              ? {
                  ...current,
                  room: {
                    ...current.room,
                    settings: { ...current.room.settings, ...nextSettings }
                  }
                }
              : current
          );
        })
        .catch(() => undefined);
    },
    [identity, roomId, setSession]
  );

  const scheduleRoomPhysicsSettings = useCallback(
    (nextPhysics: Partial<PhysicsTuning>) => {
      if (physicsDebounceRef.current) clearTimeout(physicsDebounceRef.current);
      physicsDebounceRef.current = setTimeout(() => {
        persistRoomPhysicsSettings(nextPhysics);
      }, 250);
    },
    [persistRoomPhysicsSettings]
  );

  const resetRoomPhysicsSettings = useCallback(() => {
    if (physicsDebounceRef.current) clearTimeout(physicsDebounceRef.current);
    persistRoomPhysicsSettings({});
  }, [persistRoomPhysicsSettings]);

  useEffect(
    () => () => {
      if (ambientDebounceRef.current) clearTimeout(ambientDebounceRef.current);
      if (physicsDebounceRef.current) clearTimeout(physicsDebounceRef.current);
    },
    []
  );

  return {
    localAmbientGain,
    runSkinAction,
    changeAmbientGain,
    scheduleRoomPhysicsSettings,
    resetRoomPhysicsSettings
  };
}
