import { createServer, type Server } from "node:http";

type MockSession = {
  session_id: string;
  embed_url: string;
  admin_token: string;
  currentUrl: string;
  title: string;
};

const sessions = new Map<string, MockSession>();

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function sessionFromEmbedPath(pathname: string): MockSession | undefined {
  const match = /^\/embed\/([^/]+)/.exec(pathname);
  const sessionId = match?.[1];
  if (!sessionId) return undefined;
  return sessions.get(sessionId);
}

/**
 * Minimal Hyperbeam dispatch + session admin mock for Playwright E2E.
 * Point the API at `http://127.0.0.1:<port>` via `HYPERBEAM_API_BASE`.
 */
export async function startHyperbeamMockServer(port = 19_098): Promise<Server> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const method = req.method ?? "GET";

    if (method === "POST" && url.pathname === "/v0/vm") {
      const body = JSON.parse((await readBody(req)) || "{}") as { start_url?: string };
      const sessionId = `hb_e2e_${sessions.size + 1}`;
      const startUrl = body.start_url ?? "https://www.wikipedia.org/";
      let hostname = "page";
      try {
        hostname = new URL(startUrl).hostname.replace(/^www\./, "");
      } catch {
        // keep default
      }
      const session: MockSession = {
        session_id: sessionId,
        admin_token: `admin_${sessionId}`,
        embed_url: `http://127.0.0.1:${port}/embed/${sessionId}?token=viewer`,
        currentUrl: startUrl,
        title: hostname
      };
      sessions.set(sessionId, session);
      sendJson(res, 200, {
        session_id: session.session_id,
        embed_url: session.embed_url,
        admin_token: session.admin_token
      });
      return;
    }

    const vmMatch = /^\/v0\/vm\/([^/]+)$/.exec(url.pathname);
    if (vmMatch) {
      const sessionId = decodeURIComponent(vmMatch[1]!);
      if (method === "DELETE") {
        sessions.delete(sessionId);
        sendJson(res, 200, { session_id: sessionId });
        return;
      }
      if (method === "GET") {
        const session = sessions.get(sessionId);
        if (!session) {
          res.writeHead(404);
          res.end();
          return;
        }
        sendJson(res, 200, {
          session_id: session.session_id,
          embed_url: session.embed_url,
          admin_token: session.admin_token,
          termination_date: null
        });
        return;
      }
    }

    const session = sessionFromEmbedPath(url.pathname);
    if (session && method === "POST") {
      const adminPath = url.pathname.replace(`/embed/${session.session_id}`, "").replace(/^\//, "");
      if (adminPath === "tabs.query") {
        sendJson(res, 200, [{ url: session.currentUrl, title: session.title, active: true }]);
        return;
      }
      if (adminPath === "tabs.update") {
        const raw = await readBody(req);
        const parsed = JSON.parse(raw || "{}") as { url?: string };
        const tabUrl = parsed.url ?? session.currentUrl;
        session.currentUrl = tabUrl;
        try {
          session.title = new URL(tabUrl).hostname.replace(/^www\./, "");
        } catch {
          session.title = tabUrl;
        }
        sendJson(res, 200, { url: session.currentUrl, title: session.title });
        return;
      }
      if (adminPath === "tabs.goBack" || adminPath === "tabs.goForward" || adminPath === "tabs.reload") {
        sendJson(res, 200, [{ url: session.currentUrl, title: session.title }]);
        return;
      }
    }

    if (method === "GET" && url.pathname.startsWith("/embed/")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><title>hyperbeam mock embed</title>");
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });

  return server;
}
