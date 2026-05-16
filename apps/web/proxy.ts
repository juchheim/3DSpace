import { clerkMiddleware } from "@clerk/nextjs/server";

// Disable Clerk's Frontend API proxy in local dev. Next binds to 127.0.0.1 while
// the auto-proxy targets localhost:3000, which causes 500 / ECONNREFUSED loops.
export default clerkMiddleware({
  frontendApiProxy: { enabled: false }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)"
  ]
};
