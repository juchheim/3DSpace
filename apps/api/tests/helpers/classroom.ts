import { expect } from "vitest";
import { loadConfig } from "../../src/config";
import type { TestApp } from "./app";
import { authHeaders } from "./app";

export function lessonConfig() {
  return loadConfig({ NODE_ENV: "test", ENABLE_CLASSROOM_LESSONS: "true" } as NodeJS.ProcessEnv);
}

export function breakoutPodsConfig() {
  return loadConfig({ NODE_ENV: "test", ENABLE_BREAKOUT_PODS: "true" } as NodeJS.ProcessEnv);
}

export function breakoutPodsLessonConfig() {
  return loadConfig({ NODE_ENV: "test", ENABLE_BREAKOUT_PODS: "true", ENABLE_CLASSROOM_LESSONS: "true" } as NodeJS.ProcessEnv);
}

export async function enableRoomPods(app: TestApp, roomId: string, teacherId: string) {
  const response = await app.inject({
    method: "PATCH",
    url: `/v1/rooms/${roomId}`,
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      settings: {
        pods: {
          enabled: true,
          podRadiusMeters: 3,
          podMurmurFloor: 0.08,
          drawPartitions: false
        }
      }
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

export async function classroomAction(app: TestApp, roomId: string, actorId: string, payload: Record<string, unknown>) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/classroom/actions`,
    headers: authHeaders(actorId, actorId.startsWith("student") ? "Avery" : "Ms. Rivera"),
    payload
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

