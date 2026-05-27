const SESSION_KEY = "freeForAllPassword";

export function getStoredFreeForAllPassword() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(SESSION_KEY) ?? "";
}

export function setStoredFreeForAllPassword(password: string) {
  sessionStorage.setItem(SESSION_KEY, password);
}
