"use client";

import { createContext, useContext } from "react";
import { ClerkProvider, SignInButton, UserButton, useAuth, useUser } from "@clerk/nextjs";
import { CLERK_PUBLISHABLE_KEY } from "./config";

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
  const displayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? user?.username ?? user?.id;

  return (
    <AppAuthContext.Provider
      value={{
        clerkEnabled: true,
        loaded: isLoaded,
        signedIn: Boolean(isSignedIn),
        ...(user?.id ? { userId: user.id } : {}),
        ...(displayName ? { displayName } : {}),
        getToken
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
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
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
        <SignInButton mode="modal">
          <button type="button" className="secondary">Sign in with Clerk</button>
        </SignInButton>
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
