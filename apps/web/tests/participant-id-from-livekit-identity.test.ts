import { describe, expect, it } from "vitest";
import { participantIdFromLiveKitIdentity } from "../lib/realtime";

describe("participantIdFromLiveKitIdentity", () => {
  it("strips the room suffix from google auth identities", () => {
    expect(participantIdFromLiveKitIdentity("google:abc123:room_9f3c2a1b4d5e6f7081")).toBe("google:abc123");
  });

  it("strips the room suffix from dev identities", () => {
    expect(participantIdFromLiveKitIdentity("dev-teacher:room_9f3c2a1b4d5e6f7081")).toBe("dev-teacher");
  });

  it("returns identity unchanged when it has no colon", () => {
    expect(participantIdFromLiveKitIdentity("solo-user")).toBe("solo-user");
  });
});
