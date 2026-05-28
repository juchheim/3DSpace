# Frame vs 3DSpace Feature Parity Gap Analysis

Last updated: 2026-05-28  
Scope: Compare published Frame platform functionality against current 3DSpace implementation/plans, with emphasis on Free-for-All relevance and overall parity planning.

## Sources

- Frame feature reference: https://learn.framevr.io/features
- 3DSpace implementation status:
  - `docs/planning/mvp/MVP_STATUS.md`
  - `.cursor/memory.md` (session memory snapshot)
  - `docs/planning/rooms/free-for-all/*` planning + implementation docs

## Summary

3DSpace is strong in core multi-user room experience (3D + 2D, spatial audio, room types, wall boards/media, realtime state, and education-centric workflows), but Frame still has broader productized platform coverage in several categories. The biggest parity gaps are no-code scene authoring breadth, enterprise security packaging, large-scale event support, built-in collaborative surfaces (whiteboards/shared browser), and certain AI/media tooling.

## Gap Classification

- `Missing`: No equivalent in 3DSpace today.
- `Partial`: Some building blocks exist, but not parity-level breadth/UX.
- `Planned`: Documented plan exists but feature is not complete.

## Detailed Parity Gaps (Frame functionality we do not yet fully have)

### Collaboration

1) **Whiteboards**  
Status: `Missing` (only planned mention in backlog; no shipped whiteboard object).  
Gap: Frame includes whiteboards as first-class collaboration tooling.

2) **Shared web browsers inside room**  
Status: `Missing` (web links/allowlisted embeds exist; not a true collaborative browser surface).  
Gap: Frame supports live web browser surfaces as a platform feature.

3) **Built-in text chat (group/private) with translation**  
Status: `Partial` (AI meeting notes/transcription work is planned for FFA; no confirmed production room chat + translation feature).  
Gap: Frame has direct text-chat + translation capability as core collaboration.

4) **Real-time collaborative in-room editing model**  
Status: `Partial` (multi-user board/media edits exist, but not broad "co-edit the world in real time" tooling with drag-and-drop builder UX).  
Gap: Frame positions collaborative editing itself as a core capability.

### No-Code Customization / Content Authoring

5) **Drag-and-drop no-code room builder with broad asset primitives**  
Status: `Partial` (room objects and wall objects exist, but no general drag-and-drop world editor with broad primitive palette).  
Gap: Frame supports rich no-code authoring for many content types and interactions.

6) **Native support breadth for asset types in one unified editor**  
Status: `Partial`  
What Frame advertises beyond current 3DSpace breadth:
- 360 photos/videos as authored scene assets (not just skin/panorama assumptions)
- PDFs as direct in-world object type (3DSpace has docs/slides conceptually but not full parity UX surface)
- Built-in shaders/particle-systems authoring controls
- First-class shape/text authoring tools

7) **Proximity-trigger/button interactivity authoring for non-dev users**  
Status: `Missing`  
Gap: 3DSpace has feature engineering and planned extensions, but not an explicit no-code trigger system.

### Scale / Reach

8) **Large-event scale posture (300 default, up to 1,000 with tuning)**  
Status: `Missing` (3DSpace target/cap is ~30 participants; larger sessions are not current product posture).  
Gap: Significant scaling parity gap versus Frame’s event-oriented positioning.

9) **Cross-device promise at Frame’s scale envelope (desktop/mobile/VR)**  
Status: `Partial` (browser-based works, but no explicit parity-level mobile/VR product claims at high concurrent scale).  
Gap: Device + capacity confidence at parity level is not yet demonstrated.

### Presentation Tools

10) **Scenes as a native presentation journey model**  
Status: `Missing`  
Gap: 3DSpace has classroom orchestration and board workflows, but not a generalized "scene deck" progression model.

11) **Closed captions as shipped platform feature**  
Status: `Planned` (AI meeting notes/transcription planning for FFA).  
Gap: Not yet available as broad product feature parity.

12) **Green-screen transparency + polished presentational media controls**  
Status: `Missing`  
Gap: Media share exists, but not full Frame-grade presentation tooling depth.

### Graphics / 3D Creator Pipeline

13) **Broad, documented creator pipeline parity for custom environments and advanced rendering controls**  
Status: `Partial` (world skins, room objects, panoramas, and lighting support exist/planned, but not full parity packaging).  
Frame-claimed areas still ahead:
- Turnkey pipeline posture for custom environments at scale
- Productized particle-system and advanced material workflows for non-engineering users

### Artificial Intelligence

14) **Built-in image generation and skybox generation**  
Status: `Missing`  
Gap: 3DSpace has planned AI 3D objects + AI meeting notes in FFA, but not these AI creation modes as shipped platform tools.

15) **GPT-powered text chat assistant integrated into room chat**  
Status: `Missing`  
Gap: No equivalent integrated room chat assistant currently.

16) **AI NPCs as standard feature**  
Status: `Missing`  
Gap: No equivalent NPC system is documented as implemented.

### Scripting + API Platform Surface

17) **Externally managed frame-level admin/content operations at broad platform level**  
Status: `Partial`  
3DSpace has strong internal APIs but parity gap remains in:
- Mature externally-focused "manage all spaces" API posture
- Productized admin workflows (member/admin/content operations) with broad self-serve docs parity

### Security / Enterprise

18) **SOC2 compliance package**  
Status: `Missing` (not documented as achieved).  
Gap: Enterprise procurement blocker relative to Frame.

19) **Granular permissions matrix across view/edit/interact/talk as productized controls**  
Status: `Partial` (room/class controls exist; some teacher policies exist; but not full broad configurable matrix parity).  
Gap: Need richer permission surface and policy UX.

20) **Custom isolated deployment + custom SSO offering**  
Status: `Missing`  
Gap: 3DSpace deploy stack exists but no formal isolated enterprise deployment/SSO product packaging.

21) **Feature-disable policy controls as explicit admin surface**  
Status: `Partial` (feature flags exist internally; not a polished admin governance surface).  
Gap: Need tenant/admin-facing controls.

22) **Password-protected public spaces as simple admin option**  
Status: `Partial` (FFA has password gating, but not broad parity-level room security UX across product).  
Gap: Needs generalized and consistent access-policy controls.

## Suggested Parity Prioritization (Pragmatic Order)

1. **High Impact / Near-Term**
- Whiteboard surface (core collaboration expectation)
- In-room text chat + translation + basic assistant
- Closed captions (start with AI meeting-notes pipeline generalization)
- Shared browser surface (safe allowlist + moderation controls)

2. **Platform Maturity**
- No-code trigger/interactivity tools
- Scene-based presentation flow
- Unified media/object authoring UX for non-technical creators

3. **Enterprise / Revenue Unlock**
- SOC2 track
- Admin permission matrix and governance controls
- SSO + isolated deployment options

4. **Scale Expansion**
- Capacity roadmap beyond 30 participants
- Performance test harness + operational profile for larger events

## Notes for Free-for-All Planning

- FFA already has useful foundations (open join, dynamic boards, AI meeting-notes plan, AI 3D object plan), which can become the fastest path to parity wins in collaboration + AI.
- For parity messaging, prioritize converting planned FFA AI features into production-ready cross-room capabilities where sensible.
- Feature parity should be tracked as `Frame capability -> 3DSpace equivalent -> maturity stage -> owner -> target milestone`.

