import { cookies } from "next/headers";
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

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return NextResponse.json({ error: "auth-session-expired", message: "Session expired. Sign in again." }, { status: 401 });
  }

  const apiResponse = await fetch(`${API_URL}/v1/auth/session/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  const payload = await apiResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!apiResponse.ok) {
    const response = NextResponse.json(payload, { status: apiResponse.status });
    response.cookies.delete(REFRESH_COOKIE);
    return response;
  }

  const nextRefreshToken = typeof payload.refreshToken === "string" ? payload.refreshToken : "";
  const refreshExpiresAt = typeof payload.refreshExpiresAt === "string" ? payload.refreshExpiresAt : undefined;
  const { refreshToken: _refreshToken, refreshExpiresAt: _refreshExpiresAt, ...clientPayload } = payload;
  const response = NextResponse.json(clientPayload);
  response.cookies.set(REFRESH_COOKIE, nextRefreshToken, cookieOptions(refreshExpiresAt));
  return response;
}
