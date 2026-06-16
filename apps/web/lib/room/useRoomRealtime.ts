"use client";

import { useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  AvatarAccessoriesMessageSchema,
  AvatarAppearanceMessageSchema,
  AvatarBodyMessageSchema,
  AvatarReactionMessageSchema,
  ParticipantAudioModeMessageSchema,
  RoomPlayModeMessageSchema,
  RoomSkinMessageSchema,
  type AvatarAppearance,
  type AvatarBodySlug,
  type AvatarEquippedAccessories,
  type AvatarReactionMessage,
  type AvatarStateMessage,
  type RoomSessionResponse
} from "@3dspace/contracts";
import { createAvatarState } from "@3dspace/room-engine";
import { pickDisplayName } from "../displayName";
import { createRealtimeClient, type RealtimeClient, type RealtimeMessage } from "../realtime";
import type { ParticipantView } from "./types";

type WallMediaEntry = {
  videoStream?: MediaStream | null;
  audioStream?: MediaStream | null;
};

type RealtimeHandlerRef = MutableRefObject<(message: RealtimeMessage) => boolean>;

type UseRoomRealtimeInput = {
  roomId: string;
  session: RoomSessionResponse | null;
  leaving: boolean;
  identityDisplayName: string;
  localAvatarState: AvatarStateMessage | null;
  mediaCameraStream: MediaStream | null;
  mediaMicStream: MediaStream | null;
  avatarAccessoriesEnabled: boolean;
  avatarBodiesEnabled: boolean;
  wallObjects: Array<{
    id: string;
    type: string;
    status: string;
    source: {
      kind: string;
      participantId?: string | undefined;
    };
  }>;
  realtimeRef: MutableRefObject<RealtimeClient | null>;
  realtimeGenerationRef: MutableRefObject<number>;
  avatarStateRef: MutableRefObject<AvatarStateMessage | null>;
  displayNameRef: MutableRefObject<string>;
  memberNamesRef: MutableRefObject<Map<string, string>>;
  seenParticipantsRef: MutableRefObject<Set<string>>;
  localAppearanceRef: MutableRefObject<AvatarAppearance>;
  localAppearanceCustomizedRef: MutableRefObject<boolean>;
  localAccessoriesRef: MutableRefObject<AvatarEquippedAccessories>;
  localBodySlugRef: MutableRefObject<AvatarBodySlug>;
  waveTriggeredRef: MutableRefObject<boolean>;
  handlerRegistry: RealtimeHandlerRef[];
  setStatus: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  setSession: Dispatch<SetStateAction<RoomSessionResponse | null>>;
  setParticipants: Dispatch<SetStateAction<Record<string, ParticipantView>>>;
  setRemoteWallMedia: Dispatch<SetStateAction<Record<string, WallMediaEntry>>>;
  setLocalWallMedia: Dispatch<SetStateAction<Record<string, WallMediaEntry>>>;
  receiveAppearance(
    participantId: string,
    appearance: AvatarAppearance,
    customized: boolean
  ): void;
  receiveAccessories(participantId: string, accessories: AvatarEquippedAccessories): void;
  receiveBody(participantId: string, bodySlug: AvatarBodySlug): void;
  receiveReaction(message: AvatarReactionMessage): void;
  receiveAudioMode(message: {
    type: "participant.audio-mode.v1";
    participantId: string;
    mode: "normal" | "whisper" | "broadcast";
    radiusMeters: number;
  }): void;
  dropReaction(participantId: string): void;
  dropAudioMode(participantId: string): void;
  dropCaptionsContributor(participantId: string): void;
  setTargetSkinId(nextSkinId: string | null): void;
  setTargetDayNightMode(mode: "day" | "night"): void;
  warmPermissions(): Promise<void>;
};

const IGNORED_MESSAGE_PREFIXES = [
  "wall.",
  "room.whiteboard.",
  "room.shared-browser.",
  "room.object.",
  "room.build.",
  "room.logic.",
  "room.session.",
  "room.board.",
  "room.meeting-notes.",
  "room.captions.",
  "room.translation.",
  "room.ai-host."
] as const;

function publishLocalParticipantMetadata(input: {
  client: RealtimeClient;
  session: RoomSessionResponse;
  displayName: string;
  localAppearanceRef: MutableRefObject<AvatarAppearance>;
  localAppearanceCustomizedRef: MutableRefObject<boolean>;
  localAccessoriesRef: MutableRefObject<AvatarEquippedAccessories>;
  localBodySlugRef: MutableRefObject<AvatarBodySlug>;
  avatarAccessoriesEnabled: boolean;
  avatarBodiesEnabled: boolean;
}) {
  input.client.publish({
    type: "participant.presence.v1",
    participantId: input.session.participantId,
    displayName: input.displayName,
    role: input.session.role
  });
  input.client.publish({
    type: "avatar.appearance.v1",
    participantId: input.session.participantId,
    appearance: input.localAppearanceRef.current,
    customized: input.localAppearanceCustomizedRef.current
  });
  if (input.avatarAccessoriesEnabled) {
    input.client.publish({
      type: "avatar.accessories.v1",
      participantId: input.session.participantId,
      accessories: input.localAccessoriesRef.current
    });
  }
  if (input.avatarBodiesEnabled) {
    input.client.publish({
      type: "avatar.body.v1",
      participantId: input.session.participantId,
      bodySlug: input.localBodySlugRef.current
    });
  }
}

function hasIgnoredPrefix(type: string) {
  return IGNORED_MESSAGE_PREFIXES.some((prefix) => type.startsWith(prefix));
}

export function useRoomRealtime(input: UseRoomRealtimeInput) {
  const receiveAppearanceRef = useRef(input.receiveAppearance);
  receiveAppearanceRef.current = input.receiveAppearance;
  const receiveAccessoriesRef = useRef(input.receiveAccessories);
  receiveAccessoriesRef.current = input.receiveAccessories;
  const receiveBodyRef = useRef(input.receiveBody);
  receiveBodyRef.current = input.receiveBody;
  const receiveReactionRef = useRef(input.receiveReaction);
  receiveReactionRef.current = input.receiveReaction;
  const receiveAudioModeRef = useRef(input.receiveAudioMode);
  receiveAudioModeRef.current = input.receiveAudioMode;
  const dropReactionRef = useRef(input.dropReaction);
  dropReactionRef.current = input.dropReaction;
  const dropAudioModeRef = useRef(input.dropAudioMode);
  dropAudioModeRef.current = input.dropAudioMode;
  const dropCaptionsContributorRef = useRef(input.dropCaptionsContributor);
  dropCaptionsContributorRef.current = input.dropCaptionsContributor;
  const setTargetSkinIdRef = useRef(input.setTargetSkinId);
  setTargetSkinIdRef.current = input.setTargetSkinId;
  const setTargetDayNightModeRef = useRef(input.setTargetDayNightMode);
  setTargetDayNightModeRef.current = input.setTargetDayNightMode;
  const warmPermissionsRef = useRef(input.warmPermissions);
  warmPermissionsRef.current = input.warmPermissions;

  useEffect(() => {
    if (!input.session || input.leaving) return;
    const activeSession = input.session;
    const generation = ++input.realtimeGenerationRef.current;

    function handleMessage(message: RealtimeMessage) {
      for (const handlerRef of input.handlerRegistry) {
        if (handlerRef.current(message)) return;
      }
      if (hasIgnoredPrefix(message.type)) return;

      if (message.type === "participant.leave.v1") {
        dropReactionRef.current(message.participantId);
        dropCaptionsContributorRef.current(message.participantId);
        dropAudioModeRef.current(message.participantId);
        input.setParticipants((current) => {
          const next = { ...current };
          delete next[message.participantId];
          return next;
        });
        return;
      }

      if (message.type === "participant.audio-mode.v1") {
        const parsed = ParticipantAudioModeMessageSchema.safeParse(message);
        if (parsed.success) receiveAudioModeRef.current(parsed.data);
        return;
      }

      if (message.type === "participant.presence.v1") {
        if (!input.seenParticipantsRef.current.has(message.participantId)) {
          input.seenParticipantsRef.current.add(message.participantId);
          publishLocalParticipantMetadata({
            client: input.realtimeRef.current!,
            session: activeSession,
            displayName: input.displayNameRef.current,
            localAppearanceRef: input.localAppearanceRef,
            localAppearanceCustomizedRef: input.localAppearanceCustomizedRef,
            localAccessoriesRef: input.localAccessoriesRef,
            localBodySlugRef: input.localBodySlugRef,
            avatarAccessoriesEnabled: input.avatarAccessoriesEnabled,
            avatarBodiesEnabled: input.avatarBodiesEnabled
          });
        }
        input.setParticipants((current) => {
          const existing = current[message.participantId];
          const displayName = pickDisplayName(
            message.participantId,
            message.displayName,
            existing?.displayName,
            input.memberNamesRef.current.get(message.participantId)
          );
          if (!existing) {
            return {
              ...current,
              [message.participantId]: {
                id: message.participantId,
                displayName,
                role: message.role,
                local: false,
                state: createAvatarState({
                  manifest: activeSession.manifest,
                  participantId: message.participantId,
                  role: message.role,
                  viewMode: activeSession.room.settings.defaultViewMode
                }),
                lastSeenAt: Date.now()
              }
            };
          }
          return {
            ...current,
            [message.participantId]: {
              ...existing,
              displayName,
              role: message.role,
              lastSeenAt: Date.now()
            }
          };
        });
        return;
      }

      if (message.type === "avatar.appearance.v1") {
        const parsed = AvatarAppearanceMessageSchema.safeParse(message);
        if (parsed.success) {
          receiveAppearanceRef.current(
            parsed.data.participantId,
            parsed.data.appearance,
            Boolean(parsed.data.customized)
          );
        }
        return;
      }

      if (message.type === "avatar.accessories.v1") {
        const parsed = AvatarAccessoriesMessageSchema.safeParse(message);
        if (parsed.success) {
          receiveAccessoriesRef.current(parsed.data.participantId, parsed.data.accessories);
        }
        return;
      }

      if (message.type === "avatar.body.v1") {
        const parsed = AvatarBodyMessageSchema.safeParse(message);
        if (parsed.success) {
          receiveBodyRef.current(parsed.data.participantId, parsed.data.bodySlug);
        }
        return;
      }

      if (message.type === "avatar.reaction.v1") {
        const parsed = AvatarReactionMessageSchema.safeParse(message);
        if (parsed.success) receiveReactionRef.current(parsed.data);
        return;
      }

      if (message.type === "room.skin.v1") {
        const parsed = RoomSkinMessageSchema.safeParse(message);
        if (parsed.success) {
          setTargetSkinIdRef.current(parsed.data.skinId);
          setTargetDayNightModeRef.current(parsed.data.dayNight);
        }
        return;
      }

      if (message.type === "room.play-mode.v1") {
        const parsed = RoomPlayModeMessageSchema.safeParse(message);
        if (parsed.success && parsed.data.roomId === input.roomId) {
          input.setSession((current) =>
            current
              ? {
                  ...current,
                  room: {
                    ...current.room,
                    settings: {
                      ...current.room.settings,
                      playModeEnabled: parsed.data.playModeEnabled
                    }
                  }
                }
              : current
          );
        }
        return;
      }

      if (message.type !== "avatar.state.v1") return;

      input.setParticipants((current) => {
        const existing = current[message.participantId];
        return {
          ...current,
          [message.participantId]: {
            ...existing,
            id: message.participantId,
            displayName: pickDisplayName(
              message.participantId,
              existing?.displayName,
              input.memberNamesRef.current.get(message.participantId)
            ),
            role: existing?.role ?? "student",
            local: false,
            state: message,
            lastSeenAt: Date.now()
          }
        };
      });
    }

    input.seenParticipantsRef.current = new Set();
    input.setStatus("Connecting to LiveKit...");
    void warmPermissionsRef.current()
      .then(() =>
        createRealtimeClient({
          roomId: input.roomId,
          session: input.session!,
          displayName: input.displayNameRef.current,
          isStale: () => generation !== input.realtimeGenerationRef.current,
          onMessage: handleMessage,
          onRemoteMedia(update) {
            if (update.wallObjectId) {
              input.setRemoteWallMedia((current) => ({
                ...current,
                [update.wallObjectId!]: {
                  ...(current[update.wallObjectId!] ?? {}),
                  ...(update.wallVideoStream !== undefined
                    ? { videoStream: update.wallVideoStream }
                    : {}),
                  ...(update.wallAudioStream !== undefined
                    ? { audioStream: update.wallAudioStream }
                    : {})
                }
              }));
              return;
            }
            input.setParticipants((current) => {
              const existing =
                current[update.participantId] ??
                ({
                  id: update.participantId,
                  displayName: pickDisplayName(
                    update.participantId,
                    undefined,
                    input.memberNamesRef.current.get(update.participantId)
                  ),
                  role: "student",
                  local: false,
                  state: createAvatarState({
                    manifest: activeSession.manifest,
                    participantId: update.participantId,
                    viewMode: activeSession.room.settings.defaultViewMode
                  }),
                  lastSeenAt: Date.now()
                } satisfies ParticipantView);
              const nextParticipant: ParticipantView = {
                ...existing,
                state: {
                  ...existing.state,
                  media: {
                    cameraEnabled:
                      update.cameraStream !== undefined
                        ? Boolean(update.cameraStream)
                        : Boolean(existing.state.media?.cameraEnabled),
                    microphoneEnabled:
                      update.microphoneStream !== undefined
                        ? Boolean(update.microphoneStream)
                        : Boolean(existing.state.media?.microphoneEnabled),
                    speaking: Boolean(existing.state.media?.speaking)
                  }
                },
                lastSeenAt: Date.now()
              };
              if (update.cameraStream !== undefined) {
                nextParticipant.cameraStream = update.cameraStream;
              }
              if (update.microphoneStream !== undefined) {
                nextParticipant.microphoneStream = update.microphoneStream;
              }
              return {
                ...current,
                [update.participantId]: nextParticipant
              };
            });
          },
          onStatus: input.setStatus
        })
      )
      .then((client) => {
        if (!client) return;
        if (generation !== input.realtimeGenerationRef.current) {
          void client.close();
          return;
        }
        input.realtimeRef.current = client;
        publishLocalParticipantMetadata({
          client,
          session: input.session!,
          displayName: input.displayNameRef.current,
          localAppearanceRef: input.localAppearanceRef,
          localAppearanceCustomizedRef: input.localAppearanceCustomizedRef,
          localAccessoriesRef: input.localAccessoriesRef,
          localBodySlugRef: input.localBodySlugRef,
          avatarAccessoriesEnabled: input.avatarAccessoriesEnabled,
          avatarBodiesEnabled: input.avatarBodiesEnabled
        });
        client.syncParticipants();
      })
      .catch((error) => {
        if (generation !== input.realtimeGenerationRef.current) return;
        const message =
          error instanceof Error ? error.message : "Unable to connect to LiveKit.";
        input.setError(message);
        input.setStatus(message);
      });

    return () => {
      input.realtimeGenerationRef.current += 1;
      const client = input.realtimeRef.current;
      input.realtimeRef.current = null;
      void client?.close();
    };
  }, [input.leaving, input.roomId, input.session?.participantId]);

  useEffect(() => {
    if (!input.session || !input.localAvatarState) return;
    const session = input.session;
    const state = input.localAvatarState;
    input.setParticipants((current) => ({
      ...current,
      [session.participantId]: {
        id: session.participantId,
        displayName: input.identityDisplayName,
        role: session.role,
        local: true,
        state,
        cameraStream: input.mediaCameraStream,
        microphoneStream: input.mediaMicStream,
        lastSeenAt: Date.now()
      }
    }));
  }, [
    input.identityDisplayName,
    input.mediaCameraStream,
    input.mediaMicStream,
    input.localAvatarState,
    input.session?.participantId,
    input.session?.role
  ]);

  useEffect(() => {
    if (!input.session) return;
    input.setParticipants((current) => {
      const existing = current[input.session!.participantId];
      if (!existing) return current;
      if (existing.microphoneStream === input.mediaMicStream) return current;
      return {
        ...current,
        [input.session!.participantId]: {
          ...existing,
          microphoneStream: input.mediaMicStream,
          lastSeenAt: Date.now()
        }
      };
    });
  }, [input.mediaMicStream, input.session?.participantId]);

  useEffect(() => {
    if (!input.session) return;
    const interval = window.setInterval(() => {
      const state = input.avatarStateRef.current;
      if (!state) return;
      const waving = input.waveTriggeredRef.current || undefined;
      input.realtimeRef.current?.publish(waving ? { ...state, waving } : state);
    }, Math.max(60, 1000 / input.session.tuning.avatarSendHz));
    return () => window.clearInterval(interval);
  }, [input.session?.participantId, input.session?.tuning.avatarSendHz]);

  useEffect(() => {
    if (!input.session || input.leaving) return;
    const sync = () => {
      input.realtimeRef.current?.syncParticipants();
    };
    sync();
    const interval = window.setInterval(sync, 3_000);
    return () => window.clearInterval(interval);
  }, [input.leaving, input.session?.participantId]);

  useEffect(() => {
    if (!input.session) return;
    let cancelled = false;
    const publish = () => {
      if (cancelled) return;
      void input.realtimeRef.current?.setLocalMedia({
        cameraStream: input.mediaCameraStream,
        micStream: input.mediaMicStream
      });
    };
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(publish);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [input.mediaCameraStream, input.mediaMicStream, input.session]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 30_000;
      input.setParticipants((current) =>
        Object.fromEntries(
          Object.entries(current).filter(
            ([id, participant]) =>
              participant.local ||
              participant.lastSeenAt > cutoff ||
              id === input.session?.participantId
          )
        )
      );
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [input.session?.participantId]);

  useEffect(() => {
    if (!input.session) return;
    const localCameraObjectIds = new Set(
      input.wallObjects
        .filter((object) => {
          if (object.type !== "camera.live") return false;
          if (object.source.kind !== "livekit-track") return false;
          if (object.source.participantId !== input.session?.participantId) return false;
          const terminalStatus =
            object.status === "removed" ||
            object.status === "source_ended" ||
            object.status === "failed" ||
            object.status === "rejected";
          return !terminalStatus;
        })
        .map((object) => object.id)
    );

    input.setLocalWallMedia((current) => {
      let next = current;
      for (const objectId of localCameraObjectIds) {
        if (current[objectId]?.videoStream === input.mediaCameraStream) continue;
        if (next === current) next = { ...current };
        next[objectId] = {
          ...(next[objectId] ?? {}),
          videoStream: input.mediaCameraStream
        };
      }
      for (const objectId of Object.keys(current)) {
        if (localCameraObjectIds.has(objectId)) {
          if (input.mediaCameraStream) continue;
          if (next === current) next = { ...current };
          next[objectId] = { ...(next[objectId] ?? {}), videoStream: null };
          continue;
        }
        const object = input.wallObjects.find((candidate) => candidate.id === objectId);
        if (object?.type !== "camera.live") continue;
        if (next === current) next = { ...current };
        delete next[objectId];
      }
      return next;
    });
  }, [input.mediaCameraStream, input.session?.participantId, input.wallObjects]);
}
