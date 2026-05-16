"use client";

import { useEffect, useState } from "react";
import { useAppAuth } from "./auth";
import { DEFAULT_IDENTITY, identityForRole, type ApiIdentity, type DevIdentity } from "./identity";

const STORAGE_KEY = "3dspace.identity";

export function usePersistentIdentity() {
  const appAuth = useAppAuth();
  const [identity, setIdentity] = useState<DevIdentity>(DEFAULT_IDENTITY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setIdentity(JSON.parse(stored) as DevIdentity);
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
  }, [identity, loaded]);

  function setRole(role: "teacher" | "student") {
    setIdentity(identityForRole(role));
  }

  const effectiveIdentity: ApiIdentity =
    appAuth.clerkEnabled && appAuth.signedIn && appAuth.userId
      ? {
          userId: appAuth.userId,
          displayName: appAuth.displayName ?? appAuth.userId,
          role: identity.role,
          ...(appAuth.getToken ? { getAuthToken: appAuth.getToken } : {})
        }
      : identity;

  return {
    identity: effectiveIdentity,
    setIdentity,
    setRole,
    loaded: loaded && appAuth.loaded,
    clerkEnabled: appAuth.clerkEnabled,
    signedIn: appAuth.signedIn
  };
}
