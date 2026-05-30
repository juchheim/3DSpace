import { expect } from "vitest";
import { loadConfig } from "../../src/config";
import type { TestApp } from "./app";
import { authHeaders } from "./app";

export function buildPiecesConfig(env: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: "test",
    ENABLE_FREE_FOR_ALL: "true",
    FREE_FOR_ALL_PASSWORD: "open-sesame",
    ENABLE_FREE_FOR_ALL_BUILDING: "true",
    ...env
  } as NodeJS.ProcessEnv);
}

export async function enableBuildingForRoom(
  app: TestApp,
  roomId: string,
  teacherId: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await app.inject({
    method: "PATCH",
    url: `/v1/rooms/${roomId}`,
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      settings: {
        buildingEnabled: true,
        buildDestroyPolicy: "anyone",
        ...overrides
      }
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}
