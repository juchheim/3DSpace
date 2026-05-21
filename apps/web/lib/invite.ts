import { APP_URL } from "./config";

export function inviteJoinUrl(roomId: string, code: string) {
  return `${APP_URL}/rooms/${roomId}?invite=${encodeURIComponent(code)}`;
}

export async function copyInviteText(text: string) {
  await navigator.clipboard.writeText(text);
}
