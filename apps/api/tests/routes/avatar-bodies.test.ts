import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { authHeaders } from "../helpers/app";

describe("avatar body routes", () => {
  const userId = "user-bodies-test";

  async function buildBodiesApp(env: NodeJS.ProcessEnv = { NODE_ENV: "test", ENABLE_AVATAR_BODIES: "true" }) {
    return buildApp({
      config: loadConfig(env as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
  }

  async function ensureUser(app: Awaited<ReturnType<typeof buildBodiesApp>>) {
    await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: authHeaders(userId, "Alex Rivera")
    });
  }

  it("GET /v1/avatar-bodies returns the builtin catalog when flag is on", async () => {
    const app = await buildBodiesApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/avatar-bodies",
      headers: authHeaders(userId, "Alex Rivera")
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(3);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "azure-vanguard")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "azure-vanguard-hd")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "ixr-female-20k")).toBe(true);
    await app.close();
  });

  it("PATCH /v1/users/me/body persists the selected body", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "ixr-female-20k" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("ixr-female-20k");

    const me = await app.inject({
      method: "GET",
      url: "/v1/users/me",
      headers: authHeaders(userId, "Alex Rivera")
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().avatar.bodySlug).toBe("ixr-female-20k");
    await app.close();
  });

  it("returns 404 when ENABLE_AVATAR_BODIES is false", async () => {
    const app = await buildBodiesApp({ NODE_ENV: "test", ENABLE_AVATAR_BODIES: "false" });
    const res = await app.inject({
      method: "GET",
      url: "/v1/avatar-bodies",
      headers: authHeaders(userId, "Alex Rivera")
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
