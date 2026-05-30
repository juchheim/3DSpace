import { expect } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";

export type TestApp = Awaited<ReturnType<typeof buildApp>>;
export type BuildTestAppOptions = Partial<NonNullable<Parameters<typeof buildApp>[0]>>;

export function authHeaders(userId: string, name: string) {
  return {
    "x-dev-user-id": userId,
    "x-dev-user-name": name
  };
}

export async function buildTestApp(overrides: BuildTestAppOptions = {}) {
  return buildApp({
    config: overrides.config ?? loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
    repository: overrides.repository ?? new MemoryRepository(),
    roomObjectGrabLock: overrides.roomObjectGrabLock,
    sharedBrowserOrchestrator: overrides.sharedBrowserOrchestrator
  });
}

export async function createClassAndRoom(
  app: TestApp,
  teacherId = "teacher-wall",
  roomType: "classroom" | "workforce-training" | "free-for-all" = "classroom"
) {
  const classResponse = await app.inject({
    method: "POST",
    url: "/v1/classes",
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: { name: `Wall Media ${teacherId}` }
  });
  expect(classResponse.statusCode).toBe(200);
  const classRecord = classResponse.json();

  const roomResponse = await app.inject({
    method: "POST",
    url: "/v1/rooms",
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      classId: classRecord.id,
      name: "Wall Lab",
      type: roomType,
      ...(roomType === "free-for-all" ? { freeForAllPassword: "open-sesame" } : {})
    }
  });
  expect(roomResponse.statusCode).toBe(200);
  const roomWithManifest = roomResponse.json();
  return { classRecord, roomWithManifest };
}

export async function addStudentMember(
  app: TestApp,
  classId: string,
  teacherId: string,
  userId: string,
  displayName: string
) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/classes/${classId}/members`,
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      userId,
      displayName,
      role: "student",
      status: "active"
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

