import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { authHeaders, createClassAndRoom } from "../helpers/app";

describe("workforce-training room type", () => {
  async function setup(env: Record<string, string> = {}) {
    const config = loadConfig({ NODE_ENV: "test", ...env } as NodeJS.ProcessEnv);
    const app = await buildApp({ config, repository: new MemoryRepository() });

    const classRes = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { name: "Acme Field Ops" }
    });
    expect(classRes.statusCode).toBe(200);
    return { app, classId: classRes.json().id };
  }

  it("returns 403 when ENABLE_WORKFORCE_TRAINING is false", async () => {
    const { app, classId } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { classId, name: "Compliance Refresher", type: "workforce-training" }
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("creates a workforce-training room with the multi-zone manifest when flag is on", async () => {
    const { app, classId } = await setup({ ENABLE_WORKFORCE_TRAINING: "true" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { classId, name: "Compliance Refresher", type: "workforce-training" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.room.type).toBe("workforce-training");
    expect(body.manifest.wallAnchors).toHaveLength(16);
    await app.close();
  });

  it("manifest for workforce-training room contains a left-side-room anchor label", async () => {
    const { app, classId } = await setup({ ENABLE_WORKFORCE_TRAINING: "true" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { classId, name: "Compliance Refresher", type: "workforce-training" }
    });
    const body = res.json();
    const labels: string[] = body.manifest.wallAnchors.map((a: { label: string }) => a.label.toLowerCase());
    expect(labels.some((l) => l.includes("left side room"))).toBe(true);
    await app.close();
  });

  it("GET manifest for workforce-training room does not rewrite geometry to classroom shell", async () => {
    const { app, classId } = await setup({ ENABLE_WORKFORCE_TRAINING: "true" });
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { classId, name: "Compliance Refresher", type: "workforce-training" }
    });
    const roomId: string = createRes.json().room.id;

    const manifestRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/manifest`,
      headers: authHeaders("instructor-1", "Instructor Rivera")
    });
    expect(manifestRes.statusCode).toBe(200);
    expect(manifestRes.json().dimensions.width).toBe(68);
    await app.close();
  });

  it("classroom state endpoint is unavailable for workforce-training rooms", async () => {
    const { app, classId } = await setup({ ENABLE_WORKFORCE_TRAINING: "true" });
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { classId, name: "Compliance Refresher", type: "workforce-training" }
    });
    const roomId: string = createRes.json().room.id;

    const classroomRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("instructor-1", "Instructor Rivera")
    });

    expect(classroomRes.statusCode).toBe(404);
    expect(classroomRes.json().message).toMatch(/classroom features are unavailable/i);
    await app.close();
  });

  it("classroom actions are unavailable for workforce-training rooms", async () => {
    const { app, classId } = await setup({ ENABLE_WORKFORCE_TRAINING: "true" });
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { classId, name: "Compliance Refresher", type: "workforce-training" }
    });
    const roomId: string = createRes.json().room.id;

    const actionRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { type: "raise-hand" }
    });

    expect(actionRes.statusCode).toBe(404);
    expect(actionRes.json().message).toMatch(/classroom features are unavailable/i);
    await app.close();
  });

  it("existing classroom room creation (no type) still defaults to classroom", async () => {
    const { app, classId } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("instructor-1", "Instructor Rivera"),
      payload: { classId, name: "Wave Lab" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.room.type).toBe("classroom");
    expect(body.manifest.dimensions.width).toBe(30);
    await app.close();
  });
});
