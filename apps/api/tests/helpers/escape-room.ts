import { loadConfig } from "../../src/config";

export function escapeRoomConfig(env: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: "test",
    ENABLE_ESCAPE_ROOM: "true",
    ...env
  } as NodeJS.ProcessEnv);
}
