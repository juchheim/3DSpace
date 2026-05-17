"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { ClerkProvider, UserButton, useAuth, useUser } from "@clerk/nextjs";
import { APP_URL, CLERK_PUBLISHABLE_KEY } from "./config";
import { resolveClerkDisplayName } from "./displayName";

type AppAuthContextValue = {
  clerkEnabled: boolean;
  loaded: boolean;
  signedIn: boolean;
  userId?: string;
  displayName?: string;
  getToken?: () => Promise<string | null>;
};

const devAuth: AppAuthContextValue = {
  clerkEnabled: false,
  loaded: true,
  signedIn: true
};

const AppAuthContext = createContext<AppAuthContextValue>(devAuth);

function ClerkAuthBridge({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const displayName = resolveClerkDisplayName(user, user?.id);

  return (
    <AppAuthContext.Provider
      value={{
        clerkEnabled: true,
        loaded: isLoaded,
        signedIn: Boolean(isSignedIn),
        ...(user?.id ? { userId: user.id } : {}),
        ...(displayName ? { displayName } : {}),
        getToken: () => getToken()
      }}
    >
      {children}
    </AppAuthContext.Provider>
  );
}

export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  if (!CLERK_PUBLISHABLE_KEY) {
    return <AppAuthContext.Provider value={devAuth}>{children}</AppAuthContext.Provider>;
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      signInUrl={`${APP_URL}/sign-in`}
      signUpUrl={`${APP_URL}/sign-up`}
      signInFallbackRedirectUrl={`${APP_URL}/`}
      signUpFallbackRedirectUrl={`${APP_URL}/`}
    >
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

export function AuthGate() {
  const auth = useAppAuth();
  if (!auth.clerkEnabled) return null;

  return (
    <div className="cluster" aria-label="Authentication status">
      {!auth.signedIn ? (
        <>
        <Link className="button secondary" href="/sign-in">
          Sign in with Clerk
        </Link>
        <span className="small">Sign in to create or join production rooms.</span>
        </>
      ) : (
        <>
        <span className="small">Signed in as {auth.displayName ?? "Clerk user"}</span>
        <UserButton />
        </>
      )}
    </div>
  );
}

export function useAppAuth() {
  return useContext(AppAuthContext);
}
