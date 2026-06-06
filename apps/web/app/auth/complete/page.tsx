"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppAuth } from "../../../lib/auth";

function AuthCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAppAuth();
  const [message, setMessage] = useState("Completing sign-in...");

  useEffect(() => {
    const error = searchParams.get("error");
    const code = searchParams.get("code");
    const returnTo = searchParams.get("returnTo") || "/";

    if (error) {
      router.replace(`/sign-in?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!code) {
      router.replace("/sign-in?error=auth-session-expired");
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/auth/session/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ code })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const nextError = typeof payload.error === "string" ? payload.error : "auth-session-expired";
          router.replace(`/sign-in?error=${encodeURIComponent(nextError)}`);
          return;
        }
        if (!cancelled) {
          auth.completeSignIn(payload);
          router.replace(returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/");
        }
      } catch {
        if (!cancelled) {
          setMessage("Sign-in failed. Redirecting...");
          router.replace("/sign-in?error=auth-oauth-failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auth, router, searchParams]);

  return (
    <main className="app-shell">
      <section className="panel stack" style={{ maxWidth: "28rem", margin: "2rem auto" }}>
        <h1>Signing in</h1>
        <p className="small">{message}</p>
      </section>
    </main>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense>
      <AuthCompleteContent />
    </Suspense>
  );
}
