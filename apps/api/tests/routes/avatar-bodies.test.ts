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
    expect(body.items).toHaveLength(12);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "azure-vanguard")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "azure-vanguard-hd")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "sit-test")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "ixr-female-20k")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "teacher-male")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "teacher-female")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "teacher-male-2")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "teacher-female-2")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "student-male")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "student-female")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "student-male-2")).toBe(true);
    expect(body.items.some((entry: { slug: string }) => entry.slug === "student-female-2")).toBe(true);
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

  it("PATCH /v1/users/me/body accepts teacher-male from the catalog", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "teacher-male" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("teacher-male");
    await app.close();
  });

  it("PATCH /v1/users/me/body accepts teacher-female from the catalog", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "teacher-female" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("teacher-female");
    await app.close();
  });

  it("PATCH /v1/users/me/body accepts teacher-male-2 from the catalog", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "teacher-male-2" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("teacher-male-2");
    await app.close();
  });

  it("PATCH /v1/users/me/body accepts teacher-female-2 from the catalog", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "teacher-female-2" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("teacher-female-2");
    await app.close();
  });

  it("PATCH /v1/users/me/body accepts student-male from the catalog", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "student-male" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("student-male");
    await app.close();
  });

  it("PATCH /v1/users/me/body accepts student-female from the catalog", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "student-female" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("student-female");
    await app.close();
  });

  it("PATCH /v1/users/me/body accepts student-male-2 from the catalog", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "student-male-2" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("student-male-2");
    await app.close();
  });

  it("PATCH /v1/users/me/body accepts student-female-2 from the catalog", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "student-female-2" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("student-female-2");
    await app.close();
  });

  it("PATCH /v1/users/me/body normalizes legacy teacher slugs", async () => {
    const app = await buildBodiesApp();
    await ensureUser(app);

    const patch = await app.inject({
      method: "PATCH",
      url: "/v1/users/me/body",
      headers: authHeaders(userId, "Alex Rivera"),
      payload: { bodySlug: "teacher-white-female" }
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().avatar.bodySlug).toBe("teacher-female");
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
