"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppAuth } from "../../../lib/auth";

const LOGO_SRC = "/dream-ixr-logo1.png";

function AuthCompleteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeSignIn } = useAppAuth();
  const [message, setMessage] = useState("Completing sign-in…");
  const exchangeStartedRef = useRef<string | null>(null);

  const error = searchParams.get("error");
  const code = searchParams.get("code");
  const returnTo = searchParams.get("returnTo") || "/";

  useEffect(() => {
    document.documentElement.classList.add("dixr-dark");
    document.body.classList.add("dixr-dark");
    return () => {
      document.documentElement.classList.remove("dixr-dark");
      document.body.classList.remove("dixr-dark");
    };
  }, []);

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
          setMessage("Sign-in failed. Redirecting…");
          router.replace("/sign-in?error=auth-oauth-failed");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, completeSignIn, error, returnTo, router]);

  return (
    <div className="dixr">
      <div className="page" style={{ justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "32px", width: "100%", maxWidth: "340px" }}>
          <img src={LOGO_SRC} alt="Dream IXR" style={{ height: "64px", width: "auto", objectFit: "contain", filter: "drop-shadow(0 0 20px rgba(0,140,255,0.5)) drop-shadow(0 0 50px rgba(0,80,200,0.3))" }} />
          <div className="panel" style={{ width: "100%", padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "16px" }}>
            <div style={{ width: "28px", height: "28px", borderRadius: "50%", border: "2px solid rgba(80,140,255,0.15)", borderTopColor: "var(--acc)", animation: "auth-complete-spin 0.8s linear infinite" }} />
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
              <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--tx)" }}>Signing in</span>
              <span style={{ fontSize: "11px", color: "var(--tx-m)" }}>{message}</span>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes auth-complete-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function AuthCompletePage() {
  return (
    <Suspense>
      <AuthCompleteContent />
    </Suspense>
  );
}
