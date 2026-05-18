import { getBrowser } from "livekit-client";

export function isSafariBrowser() {
  const browser = getBrowser();
  return browser?.name === "Safari" || browser?.os === "iOS";
}
