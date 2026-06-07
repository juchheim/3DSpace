import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AvatarAccessoriesMessageSchema,
  AvatarAccessoryCatalogEntrySchema,
  AvatarEquippedAccessoriesSchema,
  ListAvatarAccessoriesResponseSchema,
  PatchUserAvatarAccessoriesRequestSchema,
  UserSchema
} from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(here, "../../avatar-accessories/catalog/builtin.json"), "utf8")
) as unknown[];

describe("avatar accessories (contracts)", () => {
  it("default equipped accessories parse as { head: null, hands: null }", () => {
    expect(AvatarEquippedAccessoriesSchema.parse(undefined)).toEqual({ head: null, hands: null });
    expect(AvatarEquippedAccessoriesSchema.parse({})).toEqual({ head: null, hands: null });
  });

  it("accepts unknown accessory slugs at the contract layer (API validates against catalog)", () => {
    expect(AvatarEquippedAccessoriesSchema.parse({ head: "unknown-hat" })).toEqual({
      head: "unknown-hat",
      hands: null
    });
    expect(PatchUserAvatarAccessoriesRequestSchema.parse({ accessories: { head: "bowler-hat" } })).toEqual({
      accessories: { head: "bowler-hat", hands: null }
    });
  });

  it("parses legacy users without avatar.accessories", () => {
    const user = UserSchema.parse({
      id: "user-1",
      externalAuthId: "ext-1",
      displayName: "Alex",
      avatar: {
        color: "#336699",
        initials: "A"
      },
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z"
    });
    expect(user.avatar.accessories).toBeUndefined();
  });

  it("parses users with equipped accessories", () => {
    const user = UserSchema.parse({
      id: "user-1",
      externalAuthId: "ext-1",
      displayName: "Alex",
      avatar: {
        color: "#336699",
        initials: "A",
        accessories: {
          head: "bowler-hat",
          adjustments: {
            "bowler-hat": {
              positionOffset: { x: 0, y: 0.01, z: 0 },
              scaleOffset: 0.1
            }
          }
        }
      },
      createdAt: "2026-06-06T00:00:00.000Z",
      updatedAt: "2026-06-06T00:00:00.000Z"
    });
    expect(user.avatar.accessories).toEqual({
      head: "bowler-hat",
      hands: null,
      adjustments: {
        "bowler-hat": {
          positionOffset: { x: 0, y: 0.01, z: 0 },
          scaleOffset: 0.1
        }
      }
    });
  });

  it("parses builtin catalog entries and list response shape", () => {
    const items = catalog.map((entry) => AvatarAccessoryCatalogEntrySchema.parse(entry));
    expect(items).toHaveLength(2);
    expect(items.some((entry) => entry.slug === "bowler-hat")).toBe(true);
    expect(items.some((entry) => entry.slug === "red-boxing-gloves")).toBe(true);
    expect(ListAvatarAccessoriesResponseSchema.parse({ items })).toEqual({ items });
  });

  it("parses avatar.accessories.v1 realtime message", () => {
    const message = AvatarAccessoriesMessageSchema.parse({
      type: "avatar.accessories.v1",
      participantId: "p-1",
      accessories: { head: "bowler-hat" }
    });
    expect(message.type).toBe("avatar.accessories.v1");
    expect(message.accessories.head).toBe("bowler-hat");
  });
});
