# Authentication — Replace Clerk with Google SSO

Planning docs for replacing **Clerk** with **first-party Google OAuth**, restricted to email domains configured in environment variables.

| Doc | Purpose |
| --- | --- |
| [`PLAN_REPLACE_CLERK_AUTH.md`](./PLAN_REPLACE_CLERK_AUTH.md) | Goals, threat model, OAuth flow, domain policy, data model, env matrix, migration, rollout |
| [`IMPL_REPLACE_CLERK_AUTH.md`](./IMPL_REPLACE_CLERK_AUTH.md) | Phased implementation — refresh tokens in v1, Strategy A cutover, Next.js cookie proxy for split domains |

**Related**

- Current auth code: [`apps/api/src/auth.ts`](../../../apps/api/src/auth.ts), [`apps/web/lib/auth.tsx`](../../../apps/web/lib/auth.tsx), [`apps/web/proxy.ts`](../../../apps/web/proxy.ts)
- MVP auth rationale (historical): [`../mvp/MVP_IMPLEMENTATION_PLAN.md`](../mvp/MVP_IMPLEMENTATION_PLAN.md) §Chosen MVP Stack
- Deployment env matrix: [`../mvp/MVP_STATUS.md`](../mvp/MVP_STATUS.md), [`../mvp/DEPLOYMENT_CHECKLIST.md`](../mvp/DEPLOYMENT_CHECKLIST.md)

**Status:** Implemented in app/API code. Historical planning notes remain in PLAN/IMPL for rollout context.
