"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppAuth } from "../../../lib/auth";

function AuthCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeSignIn } = useAppAuth();
  const [message, setMessage] = useState("Completing sign-in...");
  const exchangeStartedRef = useRef<string | null>(null);

  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const returnTo = searchParams.get("returnTo") || "/";

  useEffect(() => {
    if (error) {
      router.replace(`/sign-in?error=${encodeURIComponent(error)}`);
      return;
    }

    if (!code) {
      router.replace("/sign-in?error=auth-session-expired");
      return;
    }
    if (exchangeStartedRef.current === code) return;
    exchangeStartedRef.current = code;

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
          completeSignIn(payload);
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
  }, [code, completeSignIn, error, returnTo, router]);

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
