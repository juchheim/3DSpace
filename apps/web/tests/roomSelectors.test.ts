import { describe, expect, it } from "vitest";
import type { RoomObject, RoomObjectTemplate, WallObject } from "@3dspace/contracts";
import {
  activeHelpRequestUserIds,
  boardGrantWallAnchors,
  findLocalParticipant,
  findSelectedRoomObject,
  findSelectedRoomObjectTemplate,
  groupByUserId,
  memberGroupIdsForUser,
  mergeWallMediaStreams,
  participantListFromRecord,
  participantNameMapFromList,
  roomObjectTemplatesById
} from "../lib/room/selectors";
import type { ParticipantView } from "../lib/room/types";

const participantA: ParticipantView = {
  id: "user-a",
  displayName: "Alex",
  role: "student",
  local: true,
  state: {
    type: "avatar.state.v1",
    participantId: "user-a",
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    viewMode: "3d"
  } as any,
  lastSeenAt: 1
};

const participantB: ParticipantView = {
  ...participantA,
  id: "user-b",
  displayName: "Bailey",
  local: false,
  state: { ...participantA.state, participantId: "user-b" }
};

describe("room selectors", () => {
  it("builds participant lists and name maps from the participant record", () => {
    const list = participantListFromRecord({
      [participantA.id]: participantA,
      [participantB.id]: participantB
    });

    expect(list).toHaveLength(2);
    expect(participantNameMapFromList(list)).toEqual({
      "user-a": "Alex",
      "user-b": "Bailey"
    });
  });

  it("indexes and resolves selected room object templates", () => {
    const templateA = { id: "template-a", name: "Dice" } as unknown as RoomObjectTemplate;
    const templateB = { id: "template-b", name: "Globe" } as unknown as RoomObjectTemplate;
    const templatesById = roomObjectTemplatesById([templateA, templateB]);
    const object = {
      id: "object-a",
      templateId: "template-b"
    } as RoomObject;

    const selected = findSelectedRoomObject([object], "object-a");
    expect(selected).toBe(object);
    expect(findSelectedRoomObjectTemplate(selected, templatesById)).toBe(templateB);
  });

  it("derives active member groups and reverse user/group lookup", () => {
    const groups = [
      {
        id: "group-a",
        status: "active",
        memberUserIds: ["user-a", "user-b"],
        targetPosition: { x: 1, y: 0, z: 1 }
      },
      {
        id: "group-b",
        status: "draft",
        memberUserIds: ["user-a"],
        targetPosition: { x: 2, y: 0, z: 2 }
      }
    ] as any[];

    expect(memberGroupIdsForUser(groups, "user-a")).toEqual(["group-a"]);
    expect(groupByUserId(groups).get("user-b")).toBe("group-a");
    expect(groupByUserId(groups).has("user-c")).toBe(false);
  });

  it("merges participant fallback media with local/remote wall overrides", () => {
    const remoteVideo = { label: "remote-video" } as unknown as MediaStream;
    const localAudio = { label: "local-audio" } as unknown as MediaStream;
    const participantCamera = { label: "participant-camera" } as unknown as MediaStream;
    const participantMic = { label: "participant-mic" } as unknown as MediaStream;
    const participant = {
      ...participantB,
      cameraStream: participantCamera,
      microphoneStream: participantMic
    };
    const wallObjects = [
      {
        id: "camera-1",
        type: "camera.live",
        status: "active",
        source: { kind: "livekit-track", participantId: participant.id }
      },
      {
        id: "mic-1",
        type: "microphone.live",
        status: "active",
        source: { kind: "livekit-track", participantId: participant.id }
      },
      {
        id: "ended-share",
        type: "browser-tab.live",
        status: "source_ended",
        source: { kind: "livekit-track", participantId: participant.id }
      }
    ] as WallObject[];

    const merged = mergeWallMediaStreams({
      remoteWallMedia: {
        "camera-1": { videoStream: remoteVideo }
      },
      localWallMedia: {
        "mic-1": { audioStream: localAudio },
        "ended-share": { videoStream: remoteVideo }
      },
      wallObjects,
      participants: [participant]
    });

    expect(merged["camera-1"]?.videoStream).toBe(remoteVideo);
    expect(merged["mic-1"]?.audioStream).toBe(localAudio);
    expect(merged["ended-share"]).toEqual({ videoStream: null, audioStream: null });
  });

  it("prefers the explicit local participant id and falls back to the local flag", () => {
    expect(findLocalParticipant([participantB, participantA], "user-b")).toBe(participantB);
    expect(findLocalParticipant([participantB, participantA], "missing")).toBe(participantA);
  });

  it("derives active help requests and merged board anchors", () => {
    expect(
      activeHelpRequestUserIds([
        { userId: "user-a", status: "raised" },
        { userId: "user-b", status: "closed" },
        { userId: "user-c", status: "acknowledged" }
      ])
    ).toEqual(new Set(["user-a", "user-c"]));

    expect(
      boardGrantWallAnchors(
        [{ id: "manifest-a" } as any],
        [{ id: "dynamic-a" } as any]
      ).map((anchor) => anchor.id)
    ).toEqual(["manifest-a", "dynamic-a"]);
  });
});
