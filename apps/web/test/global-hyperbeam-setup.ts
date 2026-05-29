import type { Server } from "node:http";
import { startHyperbeamMockServer } from "./helpers/hyperbeam-mock-server";

const HYPERBEAM_MOCK_PORT = Number(process.env.E2E_HYPERBEAM_MOCK_PORT ?? 19_098);

declare global {
  // eslint-disable-next-line no-var
  var __hyperbeamMockServer: Server | undefined;
}

export default async function globalSetup() {
  globalThis.__hyperbeamMockServer = await startHyperbeamMockServer(HYPERBEAM_MOCK_PORT);
}
