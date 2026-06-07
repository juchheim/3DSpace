import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { authHeaders } from "../helpers/app";

describe("avatar accessories routes", () => {
  const userId = "user-accessories-test";

  async function buildAccessoriesApp(env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENABLE_AVATAR_ACCESSORIES: "true" }) {
    return buildApp({
      config: loadConfig(env as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
  }

  async function ensureUser(app: Awaited<ReturnType<typeof buildAccessoriesApp>>) {
    await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: authHeaders(userId, "Alex Rivera")
    });
  }

  it("GET /v1/avatar-accessories returns the builtin catalog when flag is on", async () => {
    const app = await buildAccessoriesApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/avatar-accessories",
      headers: authHeaders(userId, "Alex Rivera")
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].slug).toBe("bowler-hat");
    expect(body.items[0].slot).toBe("head");
    await app.close();
  });

  it("equip bowler-hat then GET /v1/users/me returns accessories", async () => {
    const app = await buildAccessoriesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/accessories",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { accessories: { head: "bowler-hat" } }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.accessories).toEqual({ head: "bowler-hat" });

    const me = await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: authHeaders(userId, "Alex Rivera")
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().avatar.accessories).toEqual({ head: "bowler-hat" });
    await app.close();
  });

  it("unequip with head: null clears the slot", async () => {
    const app = await buildAccessoriesApp();
    await ensureUser(app);

    await app.inject({
      method: "PATCH",
      url: "/v1/users/me/accessories",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { accessories: { head: "bowler-hat" } }
    });

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/accessories",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { accessories: { head: null } }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.accessories).toEqual({ head: null });

    const me = await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: authHeaders(userId, "Alex Rivera")
    });
    expect(me.json().avatar.accessories).toEqual({ head: null });
    await app.close();
  });

  it("PATCH with unknown slug returns 400", async () => {
    const app = await buildAccessoriesApp();
    await ensureUser(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/accessories",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { accessories: { head: "not-a-real-hat" } }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("bad_request");
    await app.close();
  });

  it("PATCH with unknown slot returns 400", async () => {
    const app = await buildAccessoriesApp();
    await ensureUser(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/accessories",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { accessories: { head: "bowler-hat", face: "fake-glasses" } }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");
    await app.close();
  });

  it("returns 404 when ENABLE_AVATAR_ACCESSORIES is false", async () => {
    const app = await buildAccessoriesApp({ NODE_ENV: "test", ENABLE_AVATAR_ACCESSORIES: "false" });
    await ensureUser(app);

    const list = await app.inject({
      method: "GET",
      url: "/v1/avatar-accessories",
      headers: authHeaders(userId, "Alex Rivera")
    });
    expect(list.statusCode).toBe(404);
    expect(list.json().error).toBe("avatar-accessories-disabled");

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/accessories",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { accessories: { head: "bowler-hat" } }
    });
    expect(patch.statusCode).toBe(404);
    expect(patch.json().error).toBe("avatar-accessories-disabled");
    await app.close();
  });
});
