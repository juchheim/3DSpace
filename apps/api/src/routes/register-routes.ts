import type { FastifyInstance } from "fastify";
import type { AppContext } from "../app-context.js";
import { registerAiObjectRoutes } from "./ai-objects.js";
import { registerBuildPieceRoutes } from "./build-pieces.js";
import { registerClassRoutes } from "./classes.js";
import { registerClassroomRoutes } from "./classroom.js";
import { registerDevStorageRoutes } from "./dev-storage.js";
import { registerFreeForAllRoutes } from "./free-for-all.js";
import { registerInviteRoutes } from "./invites.js";
import { registerMeetingNotesRoutes } from "./meeting-notes.js";
import { registerOpsRoutes } from "./ops.js";
import { registerRoomEventRoutes } from "./room-events.js";
import { registerRoomObjectRoutes } from "./room-objects.js";
import { registerRoomsCoreRoutes } from "./rooms-core.js";
import { registerSharedBrowserRoutes } from "./shared-browsers.js";
import { registerUserRoutes } from "./users.js";
import { registerWallObjectRoutes } from "./wall-objects.js";
import { registerWhiteboardRoutes } from "./whiteboards.js";
import { registerWorldSkinRoutes } from "./world-skins.js";

export async function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  await registerOpsRoutes(app, ctx);
  await registerDevStorageRoutes(app, ctx);
  await registerWorldSkinRoutes(app, ctx);
  await registerUserRoutes(app, ctx);
  await registerClassRoutes(app, ctx);
  await registerInviteRoutes(app, ctx);
  await registerRoomsCoreRoutes(app, ctx);
  await registerFreeForAllRoutes(app, ctx);
  await registerWallObjectRoutes(app, ctx);
  await registerWhiteboardRoutes(app, ctx);
  await registerSharedBrowserRoutes(app, ctx);
  await registerMeetingNotesRoutes(app, ctx);
  await registerClassroomRoutes(app, ctx);
  await registerRoomEventRoutes(app, ctx);
  await registerRoomObjectRoutes(app, ctx);
  await registerBuildPieceRoutes(app, ctx);
  await registerAiObjectRoutes(app, ctx);
}
