"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { API_AUTH_START_URL, AUTH_REQUIRED } from "./config";

type AuthUser = {
  id: string;
  displayName: string;
  email?: string;
};

type StoredSession = {
  accessToken: string;
  expiresAt: string;
  user: AuthUser;
};

type AppAuthContextValue = {
  authRequired: boolean;
  loaded: boolean;
  signedIn: boolean;
  userId?: string;
  displayName?: string;
  email?: string;
  getToken?: () => Promise<string | null>;
  completeSignIn: (session: StoredSession) => void;
  signOut: () => Promise<void>;
};

const STORAGE_KEY = "3dspace.auth.session";
const REFRESH_EARLY_MS = 5 * 60 * 1000;

const devAuth: AppAuthContextValue = {
  authRequired: false,
  loaded: true,
  signedIn: true,
  completeSignIn: () => undefined,
  signOut: async () => undefined
};

const AppAuthContext = createContext<AppAuthContextValue>(devAuth);

function readStoredSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    const session = JSON.parse(raw) as StoredSession;
    if (!session.accessToken || !session.expiresAt || !session.user?.id) return undefined;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return undefined;
    return session;
  } catch {
    return undefined;
  }
}

function persistSession(session: StoredSession | undefined) {
  if (!session) {
    window.sessionStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method: "POST" };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const response = await fetch(path, init);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(typeof payload.message === "string" ? payload.message : "Authentication request failed");
  }
  return payload as T;
}

function googleStartUrl(returnTo: string) {
  const url = new URL(API_AUTH_START_URL);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(!AUTH_REQUIRED);
  const [session, setSession] = useState<StoredSession | undefined>();
  const refreshing = useRef<Promise<string | null> | null>(null);

  const clearSession = useCallback(() => {
    setSession(undefined);
    persistSession(undefined);
  }, []);

  const completeSignIn = useCallback((nextSession: StoredSession) => {
    setSession(nextSession);
    persistSession(nextSession);
  }, []);

  const refreshSession = useCallback(async () => {
    if (!AUTH_REQUIRED) return null;
    if (refreshing.current) return refreshing.current;
    refreshing.current = (async () => {
      try {
        const response = await postJson<{ accessToken: string; expiresAt: string }>("/api/auth/session/refresh");
        let token: string | null = null;
        setSession((current) => {
          if (!current) return current;
          const updated = { ...current, accessToken: response.accessToken, expiresAt: response.expiresAt };
          persistSession(updated);
          token = updated.accessToken;
          return updated;
        });
        return token;
      } catch {
        clearSession();
        return null;
      } finally {
        refreshing.current = null;
      }
    })();
    return refreshing.current;
  }, [clearSession]);

  const getToken = useCallback(async () => {
    if (!AUTH_REQUIRED) return null;
    const current = session ?? readStoredSession();
    if (!current) return null;
    const expiresAt = new Date(current.expiresAt).getTime();
    if (expiresAt <= Date.now()) {
      clearSession();
      return null;
    }
    if (expiresAt - Date.now() < REFRESH_EARLY_MS) {
      return refreshSession();
    }
    return current.accessToken;
  }, [clearSession, refreshSession, session]);

  const signOut = useCallback(async () => {
    try {
      await postJson("/api/auth/logout");
    } finally {
      clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    if (!AUTH_REQUIRED) return;
    const stored = readStoredSession();
    if (stored) setSession(stored);
    else window.sessionStorage.removeItem(STORAGE_KEY);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!AUTH_REQUIRED || !session) return;
    const id = window.setInterval(() => {
      const expiresAt = new Date(session.expiresAt).getTime();
      if (expiresAt - Date.now() < REFRESH_EARLY_MS) {
        void refreshSession();
      }
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refreshSession, session]);

  const value = useMemo<AppAuthContextValue>(() => {
    if (!AUTH_REQUIRED) return devAuth;
    return {
      authRequired: true,
      loaded,
      signedIn: Boolean(session),
      ...(session?.user.id ? { userId: session.user.id } : {}),
      ...(session?.user.displayName ? { displayName: session.user.displayName } : {}),
      ...(session?.user.email ? { email: session.user.email } : {}),
      getToken,
      completeSignIn,
      signOut
    };
  }, [completeSignIn, getToken, loaded, session, signOut]);

  return <AppAuthContext.Provider value={value}>{children}</AppAuthContext.Provider>;
}

export function AuthGate() {
  const auth = useAppAuth();
  const pathname = usePathname() || "/";
  if (!auth.authRequired) return null;

  return (
    <div className="cluster" aria-label="Authentication status">
      {!auth.signedIn ? (
        <>
          <Link className="button secondary" href={googleStartUrl(pathname)}>
            Sign in with Google
          </Link>
          <span className="small">Sign in to create or join production rooms.</span>
        </>
      ) : (
        <>
          <span className="small">Signed in as {auth.displayName ?? auth.email ?? "Google user"}</span>
          <button className="button secondary" type="button" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        </>
      )}
    </div>
  );
}

export function useAppAuth() {
  return useContext(AppAuthContext);
}
