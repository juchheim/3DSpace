// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { AvatarAccessoriesMessageSchema } from "@3dspace/contracts";
import { DEFAULT_EQUIPPED_ACCESSORIES, useAvatarAccessories } from "../lib/useAvatarAccessories";

describe("avatar accessories realtime", () => {
  it("merges remote and local accessories by participant", () => {
    const { result } = renderHook(() => useAvatarAccessories());

    act(() => {
      result.current.setLocalAccessories("local-1", { head: null, hands: null });
      result.current.receiveAccessories("remote-2", { head: "bowler-hat", hands: null });
    });

    expect(result.current.getAccessories("local-1")).toEqual({ head: null, hands: null });
    expect(result.current.getAccessories("remote-2")).toEqual({ head: "bowler-hat", hands: null });
    expect(result.current.getAccessories("unknown")).toEqual(DEFAULT_EQUIPPED_ACCESSORIES);
  });

  it("parses avatar.accessories.v1 message", () => {
    const message = AvatarAccessoriesMessageSchema.parse({
      type: "avatar.accessories.v1",
      participantId: "remote-2",
      accessories: { head: "bowler-hat" }
    });
    expect(message.type).toBe("avatar.accessories.v1");
    expect(message.accessories).toEqual({ head: "bowler-hat", hands: null });
  });
});
