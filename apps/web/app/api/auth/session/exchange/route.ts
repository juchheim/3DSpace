import { NextResponse } from "next/server";
import { API_URL } from "../../../../../lib/config";

const REFRESH_COOKIE = "3dspace.refresh";

function cookieOptions(expiresAt?: string) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(expiresAt ? { expires: new Date(expiresAt) } : {})
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const apiResponse = await fetch(`${API_URL}/v1/auth/session/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await apiResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!apiResponse.ok) {
    return NextResponse.json(payload, { status: apiResponse.status });
  }

  const refreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : "";
  const refreshExpiresAt = typeof payload.refreshExpiresAt === "string" ? payload.refreshExpiresAt : undefined;
  const { refreshToken: _refreshToken, refreshExpiresAt: _refreshExpiresAt, ...clientPayload } = payload;
  const response = NextResponse.json(clientPayload);
  response.cookies.set(REFRESH_COOKIE, refreshToken, cookieOptions(refreshExpiresAt));
  return response;
}
