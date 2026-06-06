"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { API_AUTH_START_URL } from "../../../lib/config";

const ERROR_MESSAGES: Record<string, string> = {
  "auth-domain-not-allowed": "Sign-in is limited to approved organization accounts. Use your work or school Google account.",
  "auth-email-not-verified": "Your Google email must be verified before you can sign in.",
  "auth-oauth-state-invalid": "Sign-in expired. Try again.",
  "auth-session-expired": "Session expired. Sign in again.",
  "auth-oauth-failed": "Google sign-in failed. Try again."
};

function googleStartUrl(returnTo: string) {
  const url = new URL(API_AUTH_START_URL);
  url.searchParams.set("returnTo", returnTo);
  return url.toString();
}

function SignInContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error") || "";
  const returnTo = searchParams.get("returnTo") || "/";

  return (
    <main className="app-shell">
      <section className="panel stack" style={{ maxWidth: "28rem", margin: "2rem auto" }}>
        <h1>Sign in</h1>
        {ERROR_MESSAGES[error] ? <p className="small">{ERROR_MESSAGES[error]}</p> : null}
        <Link className="button primary" href={googleStartUrl(returnTo)}>
          Sign in with Google
        </Link>
      </section>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
