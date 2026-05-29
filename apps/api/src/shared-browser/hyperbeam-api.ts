import type { SharedBrowserHyperbeamQuality } from "@3dspace/contracts";

export type HyperbeamVmCreateResponse = {
  session_id: string;
  embed_url: string;
  admin_token: string;
};

export type HyperbeamVmGetResponse = HyperbeamVmCreateResponse & {
  creation_date?: string;
  termination_date?: string | null;
};

export type HyperbeamVmCreateBody = {
  start_url?: string;
  width: number;
  height: number;
  framerate: number;
  quality: SharedBrowserHyperbeamQuality;
  region?: string;
  tag?: string;
  timeout?: {
    offline?: number;
    empty?: number;
  };
};

export function hyperbeamEmbedBaseUrl(embedUrl: string): string {
  const url = new URL(embedUrl);
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export class HyperbeamApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string
  ) {
    super(message);
    this.name = "HyperbeamApiError";
  }
}

export async function hyperbeamDispatchRequest(
  apiBase: string,
  apiKey: string,
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const base = apiBase.replace(/\/$/, "");
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetchImpl(url, { ...init, headers });
}

export async function hyperbeamSessionRequest(
  baseUrl: string,
  adminToken: string,
  path: string,
  init: RequestInit = {},
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${adminToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetchImpl(url, { ...init, headers });
}

async function readErrorBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

export async function hyperbeamCreateVm(
  apiBase: string,
  apiKey: string,
  body: HyperbeamVmCreateBody,
  fetchImpl: typeof fetch = fetch
): Promise<HyperbeamVmCreateResponse> {
  const response = await hyperbeamDispatchRequest(apiBase, apiKey, "/v0/vm", {
    method: "POST",
    body: JSON.stringify(body)
  }, fetchImpl);
  if (!response.ok) {
    const text = await readErrorBody(response);
    throw new HyperbeamApiError(`Hyperbeam create session failed (${response.status})`, response.status, text);
  }
  return (await response.json()) as HyperbeamVmCreateResponse;
}

export async function hyperbeamTerminateVm(
  apiBase: string,
  apiKey: string,
  hyperbeamSessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const response = await hyperbeamDispatchRequest(
    apiBase,
    apiKey,
    `/v0/vm/${encodeURIComponent(hyperbeamSessionId)}`,
    { method: "DELETE" },
    fetchImpl
  );
  if (!response.ok && response.status !== 404) {
    const text = await readErrorBody(response);
    throw new HyperbeamApiError(`Hyperbeam terminate session failed (${response.status})`, response.status, text);
  }
}

export async function hyperbeamGetVm(
  apiBase: string,
  apiKey: string,
  hyperbeamSessionId: string,
  fetchImpl: typeof fetch = fetch
): Promise<HyperbeamVmGetResponse | null> {
  const response = await hyperbeamDispatchRequest(
    apiBase,
    apiKey,
    `/v0/vm/${encodeURIComponent(hyperbeamSessionId)}`,
    { method: "GET" },
    fetchImpl
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    const text = await readErrorBody(response);
    throw new HyperbeamApiError(`Hyperbeam get session failed (${response.status})`, response.status, text);
  }
  return (await response.json()) as HyperbeamVmGetResponse;
}

export function titleFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
