import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL } from "../../../../lib/config";

const REFRESH_COOKIE = "3dspace.refresh";

export async function POST() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (refreshToken) {
    await fetch(`${API_URL}/v1/auth/logout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken })
    }).catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(REFRESH_COOKIE);
  return response;
}
