"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { RealtimeClient } from "../realtime";

type WallMediaEntry = {
  videoStream?: MediaStream | null;
  audioStream?: MediaStream | null;
};

type SetWallMedia = Dispatch<SetStateAction<Record<string, WallMediaEntry>>>;

type WallController = {
  createFileObject(input: {
    anchorId: string;
    file: File;
    title: string;
    altText?: string | undefined;
    caption?: string | undefined;
  }): Promise<unknown>;
  createInlineObject(input: {
    anchorId: string;
    type: "note" | "whiteboard" | "web.browser.shared" | "timer" | "poll";
    title: string;
    data: Record<string, unknown>;
  }): Promise<unknown>;
  createLinkObject(input: {
    anchorId: string;
    title: string;
    url: string;
  }): Promise<unknown>;
  createLiveShareObject(input: {
    anchorId: string;
    type: "camera.live" | "microphone.live" | "browser-tab.live";
    title: string;
  }): Promise<{ object: { id: string }; publicationName?: string | null | undefined }>;
  endShare(objectId: string): Promise<unknown>;
  controlObject(objectId: string, input: Record<string, unknown>): Promise<unknown>;
  removeObject(objectId: string): Promise<unknown>;
};

type MediaController = {
  cameraEnabled: boolean;
  setCameraEnabled(enabled: boolean): void;
  waitForCameraStream(timeoutMs?: number): Promise<MediaStream | null>;
  microphoneEnabled: boolean;
  setMicrophoneEnabled(enabled: boolean): void;
};

type DisplayMediaController = {
  start(): Promise<MediaStream>;
  stop(): void;
};

type UseRoomWallActionsInput = {
  wall: WallController;
  media: MediaController;
  displayMedia: DisplayMediaController;
  realtimeRef: MutableRefObject<RealtimeClient | null>;
  setLocalWallMedia: SetWallMedia;
  setRemoteWallMedia: SetWallMedia;
};

export function useRoomWallActions({
  wall,
  media,
  displayMedia,
  realtimeRef,
  setLocalWallMedia,
  setRemoteWallMedia
}: UseRoomWallActionsInput) {
  const createFileObject = useCallback(
    async (input: {
      anchorId: string;
      file: File;
      title: string;
      altText?: string | undefined;
      caption?: string | undefined;
    }) => {
      await wall.createFileObject(input);
    },
    [wall]
  );

  const createNote = useCallback(
    async (input: { anchorId: string; title: string; text: string }) => {
      await wall.createInlineObject({
        anchorId: input.anchorId,
        type: "note",
        title: input.title,
        data: { text: input.text }
      });
    },
    [wall]
  );

  const createWhiteboard = useCallback(
    async (input: { anchorId: string; title: string }) => {
      await wall.createInlineObject({
        anchorId: input.anchorId,
        type: "whiteboard",
        title: input.title,
        data: {}
      });
    },
    [wall]
  );

  const createSharedBrowser = useCallback(
    async (input: { anchorId: string; title: string; startUrl: string }) => {
      await wall.createInlineObject({
        anchorId: input.anchorId,
        type: "web.browser.shared",
        title: input.title,
        data: { startUrl: input.startUrl }
      });
    },
    [wall]
  );

  const createTimer = useCallback(
    async (input: { anchorId: string; title: string; seconds: number }) => {
      await wall.createInlineObject({
        anchorId: input.anchorId,
        type: "timer",
        title: input.title,
        data: { seconds: input.seconds }
      });
    },
    [wall]
  );

  const createPoll = useCallback(
    async (input: {
      anchorId: string;
      title: string;
      question: string;
      choices: string[];
    }) => {
      await wall.createInlineObject({
        anchorId: input.anchorId,
        type: "poll",
        title: input.title,
        data: { question: input.question, choices: input.choices }
      });
    },
    [wall]
  );

  const createLink = useCallback(
    async (input: { anchorId: string; title: string; url: string }) => {
      await wall.createLinkObject({
        anchorId: input.anchorId,
        title: input.title,
        url: input.url
      });
    },
    [wall]
  );

  const pinCamera = useCallback(
    async (anchorId: string) => {
      if (!media.cameraEnabled) media.setCameraEnabled(true);
      await media.waitForCameraStream();
      await wall.createLiveShareObject({
        anchorId,
        type: "camera.live",
        title: "Pinned camera"
      });
    },
    [media, wall]
  );

  const pinMicrophone = useCallback(
    async (anchorId: string) => {
      if (!media.microphoneEnabled) media.setMicrophoneEnabled(true);
      await wall.createLiveShareObject({
        anchorId,
        type: "microphone.live",
        title: "Pinned microphone"
      });
    },
    [media, wall]
  );

  const shareScreen = useCallback(
    async (anchorId: string) => {
      const share = await wall.createLiveShareObject({
        anchorId,
        type: "browser-tab.live",
        title: "Shared screen"
      });
      try {
        const stream = await displayMedia.start();
        const audioStream =
          stream.getAudioTracks().length > 0 ? new MediaStream(stream.getAudioTracks()) : null;
        setLocalWallMedia((current) => ({
          ...current,
          [share.object.id]: {
            videoStream: new MediaStream(stream.getVideoTracks()),
            audioStream
          }
        }));
        await realtimeRef.current?.setLocalWallShare({
          objectId: share.object.id,
          screenStream: stream,
          audioStream,
          ...(share.publicationName ? { publicationName: share.publicationName } : {})
        });
        stream.getTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            setLocalWallMedia((current) => {
              const next = { ...current };
              delete next[share.object.id];
              return next;
            });
            void realtimeRef.current?.setLocalWallShare({
              objectId: share.object.id,
              screenStream: null
            });
            void wall.endShare(share.object.id).catch(() => undefined);
          });
        });
      } catch (error) {
        await wall.endShare(share.object.id).catch(() => undefined);
        throw error;
      }
    },
    [displayMedia, realtimeRef, setLocalWallMedia, wall]
  );

  const stopShare = useCallback(
    async (objectId: string) => {
      displayMedia.stop();
      setLocalWallMedia((current) => {
        const next = { ...current };
        delete next[objectId];
        return next;
      });
      setRemoteWallMedia((current) => {
        if (!current[objectId]) return current;
        const next = { ...current };
        delete next[objectId];
        return next;
      });
      await realtimeRef.current?.setLocalWallShare({ objectId, screenStream: null });
      await wall.endShare(objectId);
    },
    [displayMedia, realtimeRef, setLocalWallMedia, setRemoteWallMedia, wall]
  );

  const controlWallObject = useCallback(
    async (
      objectId: string,
      action:
        | "play"
        | "pause"
        | "mute"
        | "unmute"
        | "seek"
        | "vote"
        | "close-poll"
        | "reopen-poll"
        | "set-slide",
      positionSeconds?: number,
      choiceId?: string,
      slideIndex?: number
    ) => {
      await wall.controlObject(objectId, {
        action,
        ...(positionSeconds !== undefined ? { positionSeconds } : {}),
        ...(choiceId ? { choiceId } : {}),
        ...(slideIndex !== undefined ? { slideIndex } : {})
      });
    },
    [wall]
  );

  const moderateWallObject = useCallback(
    async (objectId: string, action: "approve" | "reject") => {
      await wall.controlObject(objectId, { action });
    },
    [wall]
  );

  const removeWallObject = useCallback(
    async (objectId: string) => {
      await wall.removeObject(objectId);
    },
    [wall]
  );

  return {
    createFileObject,
    createNote,
    createWhiteboard,
    createSharedBrowser,
    createTimer,
    createPoll,
    createLink,
    pinCamera,
    pinMicrophone,
    shareScreen,
    stopShare,
    controlWallObject,
    moderateWallObject,
    removeWallObject
  };
}
