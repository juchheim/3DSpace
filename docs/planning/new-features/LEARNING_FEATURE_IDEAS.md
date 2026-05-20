# 3DSpace — Learning Feature Ideas

Last updated: 2026-05-20 (deprioritized Small 2 + Small 7 — browser SpeechRecognition / Chrome-first prerequisite)
Author: brainstorm pass after MVP+1 (wall media, classroom tools, lesson-run discovery slice, blocky avatars) shipped on `mvp-plus-one`.

## Purpose

3DSpace currently delivers a synchronous 3D classroom that maps neatly onto a real lecture/seat-work flow: front board, back display, left/right resource rails, a tiered theater of up to 30 seats, blocky humanoid avatars, live spatial audio, hand-raise + board-access grants, private checks, groups, focus, and a lesson-run orchestrator. The MVP and MVP+1 work prepared the engine well, but most of what makes a classroom *teach* — feedback loops, accessibility, asynchronous catch-up, on-the-spot prep, real small-group work — is still mostly latent.

This document is a brainstorm of features that would meaningfully improve 3DSpace as a learning environment. It is intentionally split into:

- **Small ideas** — each could ship in roughly 2–5 days of focused work, leans heavily on existing primitives, and answers a clear classroom pain point. Items marked **deprioritized** stay in the doc for reference but are not on the active roadmap.
- **Big ideas** — strategic moves that materially change what 3DSpace can be used for. Each is detailed enough to start scoping a discovery slice.
- **Alternate big-idea seeds** — additional strategic directions sketched at a paragraph each, so the next planning conversation has live options.

Nothing here is committed; this is the starting list for the next planning round.

---

## Existing foundation these ideas assume

To keep scope honest, every idea below explicitly reuses existing primitives. The relevant ones (so we don't reinvent them) are:

- `RoomManifest` + 3D theater geometry + 2D top-down projection (`packages/room-engine/src/index.ts`).
- `WallObject` types: `image.file`, `video.file`, `audio.file`, `camera.live`, `microphone.live`, `screen.live`, `browser-tab.live`, `web.link`, `note`, `poll`, `timer` (`packages/contracts/src/index.ts`).
- `ClassroomState` with `helpRequests`, `boardAccessGrants`, `privateChecks`, `groups`, `spotlight`, `lessonRun`, plus action endpoint with optimistic version locking.
- `LessonRun` step kinds: `instruction`, `focus-board`, `private-check`, `group-work`, `timer`, `student-share`.
- Reliable LiveKit data channel for low-frequency events (`avatar.appearance.v1`, classroom state announcements) and unreliable channel for avatar movement.
- Blocky avatar rig with walk / idle / speaking / raise-hand / wave animations.
- Teacher-only enforcement in API + classroom action handler; role-filtered GET responses so students never see classmates' private check answers.

If an idea below would require new entities outside these, it is called out explicitly.

---

## Small ideas

**Active roadmap (prioritized):** Small 1, 3, 4, 5, 6.

**Deprioritized:** Small 2 (live captions), Small 7 (translated captions) — see rationale under each. The v1 design depends on the browser `SpeechRecognition` API, which is effectively Chrome/Edge-only and unreliable on Safari. Requiring a specific browser is a poor fit for K–12 (district-managed Chromebooks are common, but not universal; teachers and students also use Safari on iPad, Firefox, etc.). We will not prioritize until captions can run **browser-agnostically** (e.g. server-side STT on the LiveKit audio track). Until then, Universal Access Phase A should lean on TTS for wall text and lesson instructions, not live speech-to-text on the wall.

---

### Small 1 — Avatar reactions ("emotes") for formative feedback

#### What
Extend the existing wave emote into a small palette of avatar reactions the student can fire from a HUD button or keyboard shortcut: 👍 got it, 😕 confused, ❓ question, 🙋 me!, 🤚 pause please, 🎉 done. The reaction shows as a floating sprite over the avatar for 2–3 seconds and also appears as a small badge on the avatar in 2D mode.

#### Why it matters for learning
The single largest gap in any remote classroom is real-time comprehension signal. A poll or private check costs the teacher a step and breaks flow. Emotes let students answer "are you with me?" passively, every 30 seconds, with no interruption. Teachers can read the room without asking. Confused / pause / question emotes also unblock students who would otherwise sit silently.

#### User stories
- *Student:* "The teacher just defined a tricky term. I tap 😕 — only the floating sprite shows, no interruption."
- *Teacher:* "I see four 😕 sprites pop up in the back tier. I rephrase and ask one of them to share."

#### Sketch
- New `avatar.reaction.v1` reliable LiveKit data message: `{ participantId, reaction, expiresAt }`.
- New `useAvatarReactions(participantId)` hook in `apps/web/lib/` mirroring `useAvatarAppearance` — small map of active reactions per participant.
- `BlockyAvatar` renders an extra Drei `<Html>` sprite above the head when a reaction is active. Reuse the existing nameplate distanceFactor + fade.
- `RoomView2D` adds a small badge next to the participant dot.
- Teacher gets a roll-up: an emoji-by-roster heat strip in `ClassroomPanel` ("12 ✅, 4 😕, 1 ❓ in the last 60s"), driven by a tiny client-side counter — no persistence needed for the first slice.
- New classroom action `set-reactions-locked` (mirrors `set-avatar-editor-locked`) so the teacher can mute reactions during a quiet moment.

#### Out of scope for v1
Persistence of reactions, exporting reaction data, "raise hand" replacement — keep the existing help queue authoritative for hand-up, since it has board-access semantics that emotes don't.

#### Effort estimate
~2 days. The hardest part is making the 3D sprite readable from across the room without clipping the camera at close range; we already solved the equivalent for nameplates and can reuse that distanceFactor.

---

### Small 2 — Live captions as a wall object (`transcript.live`) — **DEPRIORITIZED**

> **Status:** Not on the active roadmap. v1 assumed client-side `SpeechRecognition` (Chrome-first). Product decision: do not ship a feature whose core path requires a specific browser. Revisit when we adopt **server-side transcription** (LiveKit egress, Deepgram, Azure Speech, etc.) so captions work the same in Chrome, Safari, and Firefox.

#### What
A new `WallObject` type that renders the rolling spoken text of one chosen participant (default: the teacher) as captions on a wall anchor. Source is the browser's `SpeechRecognition` running on the speaker's machine; transcript chunks are pushed over the LiveKit data channel as a low-frequency reliable message and rendered as a scrolling block on a board.

#### Why it matters for learning
1. **Accessibility** — deaf / hard-of-hearing students, students in noisy environments, students still acquiring English all need captions and we currently provide none.
2. **Note-taking** — students who can read a live transcript while listening retain more and don't have to choose between listening and writing.
3. **Recap surface** — the same buffer is the basis for end-of-lesson summary (see "Exit ticket + lesson recap" below) and for a future async catch-up mode.

#### User stories
- *Teacher:* "I drag a 'Live captions' card from the wall sidebar onto the left resource rail at the start of class. The card streams my speech while I lecture."
- *Student:* "I scroll back five seconds in the captions card to re-read what the teacher just said."

#### Sketch
- New `transcript.live` value on `WallObjectTypeSchema` and a new `WallObjectSource` variant `{ kind: "transcript", participantId }`.
- Speaker's browser runs `SpeechRecognition` (with a graceful fallback message when unsupported, e.g. Firefox); chunks are emitted every ~1s as `wall.transcript.chunk.v1` realtime messages keyed by the wall object id.
- The wall object card on the board renders a scrollable buffer; the last ~20 lines are kept in client memory. Older lines drop. No persistence in v1.
- Wall anchor policy: only one `transcript.live` per anchor, allowed on anchors that already accept `note` (i.e., all five anchors today).
- 2D analog renders an inline mini-version of the latest line under the anchor label.

#### Privacy / safety
- Card shows a "🎤 Captioning [Name]" badge so participants know they're being transcribed.
- Captioning stops automatically when the source participant mutes their mic, leaves the room, or the teacher removes the card.
- No transcript text is sent to the API in v1 — it lives in client memory and LiveKit data channels only. Server persistence is an explicit follow-up gated by a privacy decision.

#### Out of scope for v1
Translation, server-side transcription, persistent transcript storage, multi-speaker captions, speaker attribution within a single card.

#### Effort estimate (if revived with server-side STT)
~1–2 weeks for a browser-agnostic v1 (STT provider + API + wall UI), not ~3 days. The original client-only sketch is intentionally shelved.

#### Future path (browser-agnostic)
- Teacher mic audio already flows through LiveKit; STT runs server-side or via a worker subscribed to the track.
- Chunks still broadcast as `wall.transcript.chunk.v1`; wall card UX unchanged.
- Higher cost and privacy review (audio leaves the client to a vendor) but no browser prerequisite.

---

### Small 3 — Exit ticket step + auto-generated lesson recap

#### What
Add a seventh lesson-run step kind, `exit-ticket`, that combines a required reflection prompt (short answer) with a confidence rating and an optional multi-choice "what next?" question. When the teacher ends the lesson, the system generates a `LessonRecap` view that summarizes: who attended, who answered each check (counts only, no names), an aggregate of exit-ticket confidence, and a CSV export of per-student exit-ticket responses for teacher-only review.

#### Why it matters for learning
The lesson-run primitive is "the place where instructional intent lives" per the discovery slice plan, but right now a lesson run just ends. There is no closing of the loop. Exit tickets are the single most-cited cheap formative-assessment instrument in K-12 instructional design — and we already have all the infra to do them cleanly (private checks, lesson steps, role-filtered responses). A recap turns the lesson run from "a thing that happened" into "data the teacher can act on next class."

#### User stories
- *Teacher (planning):* "I add an Exit Ticket as the last step of my lesson. Prompt: 'In one sentence, what's the most important thing you learned today?' Confidence: 1–5. I check 'Required to end lesson.'"
- *Teacher (live):* "When I hit End Lesson, students who haven't submitted get a 30-second 'submit your exit ticket' nag panel. I see a recap modal: 24/27 submitted, average confidence 3.4, three students rated 1–2. I export the CSV and read the reflections later."
- *Student:* "After group work the room shows me a short reflection card. I type one sentence and tap 3 for confidence. I see 'Submitted, see you tomorrow.'"

#### Sketch
- Add `exit-ticket` to `LessonStepKindSchema` and a `LessonStepExitTicketPayloadSchema` to the discriminated union — payload includes prompt text, confidence-rating range, optional "what next?" multi-choice, and `requiredToEnd: boolean`.
- Reuse `ClassroomPrivateCheck` underneath: an exit ticket creates two private checks (short-answer + confidence rating) bound to the lesson step. The "what next?" optional choice becomes a third check.
- Server: when the teacher emits `end-lesson-run` and `requiredToEnd === true`, stay in `running` until all active participants have submitted OR a teacher confirm dialog forces the end (action: `end-lesson-run`, `force: true`).
- New API: `GET /v1/rooms/:roomId/lesson-runs/:runId/recap` returns the recap object (teacher-only). CSV export is the same payload with `?format=csv`.
- New `LessonRecapPanel` component in `apps/web/components/`, modal, shown automatically when a lesson ends; also reachable from the lesson HUD as "Last lesson recap."

#### Out of scope for v1
Comparing recaps across lessons, parent/admin views, integrating recap data with any external LMS, AI-generated recap summaries (that's the AI co-pilot big idea below).

#### Effort estimate
~3–4 days. Most of the lift is correctness around `requiredToEnd` + late-join behavior. The private-check infrastructure already handles role-filtered responses and per-student submission state.

---

### Small 4 — Whisper circles (proximity-only voice)

#### What
A student (or teacher) can toggle **Whisper mode**: their microphone is heard clearly only by avatars within a configurable radius (default 3 m), and fades to silence beyond that. Everyone else in the room still hears the teacher and any non-whisper participants at normal spatial-audio levels. Whisper mode shows as a soft blue ring on the floor around the speaker's avatar and a "🔇 whisper" badge on the nameplate.

#### Why it matters for learning
Most "group work" in 3DSpace today is still one shared audio soup — groups are labels and soft-hold zones, not acoustic privacy. Whisper circles turn the theater layout into something textbooks can't replicate: *pair talk without leaving your seat*. ELA peer editing, math "explain your method to your neighbor," language practice, and confidential check-ins all need short-range speech without spinning up breakout rooms or muting the class.

#### User stories
- *Student:* "The teacher said 'turn to your neighbor.' I tap Whisper. My partner and I hear each other clearly; the rest of the room is a faint murmur."
- *Teacher:* "I walk to a struggling student's row, enable Whisper on my mic, coach them for 30 seconds, then turn it off — the class never heard the one-on-one."

#### Sketch
- Extend `useSpatialAudio` with a per-participant `audioMode: "normal" | "whisper"` on the local client; broadcast mode via `participant.audio-mode.v1` reliable message (not persisted).
- Gain curve: inside radius → full gain to listeners whose avatar is within radius of the *speaker*; outside → gain 0 (or a teacher-configurable "leak" of 5% for classroom safety).
- Teacher HUD: global "Whisper allowed" toggle + max radius slider; optional "only during group-work steps" auto-enable when `lessonRun` current step is `group-work`.
- 2D analog: dashed circle around the participant dot when whisper is active.

#### Out of scope for v1
Recording whisper conversations, teacher listen-in to all whispers simultaneously (v2: teacher could opt into "super-hear" mode), separate LiveKit subrooms.

#### Effort estimate
~3 days. Reuses spatial audio math in `packages/room-engine` and `useSpatialAudio`; no new persisted entities.

---

### Small 5 — Quiet Corner (sensory break zone)

#### What
A designated low-stimulation alcove in the back of the room that any student can enter with one tap. Inside: faded walls, no wall objects, spatial-audio gain lowered to ~50% for non-teacher voices, remote avatars hidden from local view (rendered only as faint floor dots), HUD chrome dimmed. The teacher sees who is in the corner; classmates see only a discreet "Taking a break" badge on the absent student's seat.

#### Why it sells to a district
SPED, 504, and trauma-informed classrooms are *legally required* to offer sensory-break accommodations in most US states. Almost no synchronous edtech provides one — teachers improvise with "go turn your camera off." Quiet Corner is the kind of physical-classroom pedagogy that only a 3D platform can authentically replicate. It is a procurement check-box that a district SPED director will champion personally.

#### User stories
- *Student:* "I'm overstimulated. I tap Quiet Corner. The room dims, the noise softens, no one sees where I am."
- *Teacher:* "I see in the panel that Avery has been in Quiet Corner for four minutes. I check in via a private DM before they time out."

#### Sketch
- New manifest region `quietCornerZone` (rectangle); 2D analog shows it as a softly-shaded panel labeled "Quiet."
- Entering sets local `quietMode: true`: `useSpatialAudio` dampens non-teacher gain; `RoomView3D` hides remote avatars except as floor dots; HUD opacity drops.
- Reliable `participant.quiet-mode.v1` message; teacher sees a small badge, peers see only "Taking a break."
- Teacher actions: `lock-quiet-corner` (during a test), `set-quiet-corner-max-minutes` (default 5; gentle nudge to return, not forced exit).
- Per-student counter shown to teacher only; never to peers; not part of grade data.

#### Out of scope for v1
Mandatory cooldown timers, counselor-only notification channel, integration with district SEL platforms (Phase B).

#### Effort estimate
~3 days. Reuses spatial audio, classroom state, nameplate badges.

---

### Small 6 — Digital Hall Pass

#### What
A student can request to "step out" of the room from the HUD. Teacher approves with one tap. The student's avatar parks in a `hallpass.holdingZone` just outside the seating area with a "🚪 Hall pass — 2:14" overlay; their mic auto-mutes. The teacher panel logs total away time. On return, the student taps "I'm back" and walks to their seat.

#### Why it sells to a district
This is the unglamorous compliance feature principals love. Replaces paper hall passes, logs durations for safety audits, eliminates classroom disruption ("I have to use the bathroom" out loud), and feeds attendance/behavior systems. Many districts buy entire products just for digital hall-pass tracking (e.g., e-hallpass, SmartPass). Bundling it into 3DSpace is a near-free differentiator.

#### User stories
- *Student:* "I tap 🚪 Step out. The teacher approves silently. I'm out for three minutes, no announcement."
- *Principal:* "I can pull a report showing every hall pass issued this week, who and for how long."

#### Sketch
- Extend `helpRequests` with `kind: "hallpass"` (rich kinds already supported by the schema pattern).
- New manifest region `hallpassHoldingZone`.
- New classroom actions: `approve-hallpass`, `deny-hallpass`, `return-from-hallpass`.
- Teacher panel shows currently-out roster + cumulative weekly totals.
- Room settings: max concurrent passes (default 1), per-period limit (default 2).
- Persisted to `RoomEvents` (durable) for the principal-level report.

#### Out of scope for v1
Cross-classroom hall-pass visibility (would require district-scope service), integration with school SIS attendance systems (Phase B).

#### Effort estimate
~2 days. Reuses help-request schema and classroom-action pattern.

---

### Small 7 — Translated captions for English Learners — **DEPRIORITIZED**

> **Status:** Blocked on Small 2. Same deprioritization: no live caption pipeline until STT is browser-agnostic. EL/district value remains real; delivery path is server-side STT + translation, not Web Speech API + translate.

#### What
Extends Small 2 (`transcript.live`) when that exists. Each student sets a `preferredLanguage` on their profile. When a transcript wall object is active, each viewer sees the teacher's captions **translated to their own language** in real time. One-tap "Show original" toggle to flip back to English.

#### Why it sells to a district
The single largest unmet need in big urban US districts is English Learner (EL) support. ~25% of California public school students are EL; LAUSD alone enrolls over 130,000 EL students. Federal Title III funding flows to platforms that demonstrably support EL access. Real-time captions translated *into the home language* (Spanish, Mandarin, Vietnamese, Arabic, Tagalog, Haitian Creole, Russian, Ukrainian, Somali) move 3DSpace from "synchronous tool" to "EL-mandated platform." Pairs with the Universal Access Suite below to lock in district procurement.

#### User stories
- *Newcomer student (3 months in US, Spanish home language):* "I see the teacher's words in Spanish on the board. When I'm ready, I tap to see the English original alongside."
- *Teacher:* "I have students with five home languages. Captions translate per student — I don't change anything in my lesson."

#### Sketch
- `User` profile gains `preferredLanguage` (BCP-47 tag); admin-configurable allowlist of languages enabled per district.
- New server adapter `apps/api/src/services/translation.ts` calling a translation provider (DeepL / Azure Translator / Google). Shares the LLM-provider abstraction pattern from LessonSmith.
- Each transcript chunk is translated per active language in the room (deduplicated — only translate to languages currently in use); broadcast as `wall.transcript.translation.v1` keyed by `(wallObjectId, lang)`.
- Cost control: per-class daily translation cap; cache transcripts (translation results are dedupable per chunk text).
- Feature flag: `ENABLE_TRANSLATED_CAPTIONS`.

#### Out of scope for v1
Translation of wall notes, polls, lesson instructions (Phase B); offline / on-device translation; teacher-mediated correction queue.

#### Effort estimate
~5 days assuming Small 2 ships first. Main risk is per-language cost management.

---

## Big idea — AI Teaching Co-Pilot ("LessonSmith")

### One-line pitch
A teacher-facing AI that turns a learning objective into a runnable lesson — and turns a finished lesson into a recap and a draft of tomorrow's lesson — using the existing `LessonRun` + classroom-tools primitives as its only output surface.

### Why this is the right big idea right now

Three signals point at it:

1. **Strategic alignment.** The `MVP_PLUS_ONE_LESSON_PLANNING_DISCOVERY_PLAN.md` already states that lesson planning is "the highest-leverage feature in the 3DSpace roadmap" and that the lesson-run object is the natural anchor for "analytics, exports, replay, AI assistance, multi-class reuse." The discovery slice deliberately under-built authoring so we could see which step types teachers reach for. We now have the right primitives to let an AI write a lesson directly into those primitives.
2. **Cost of teacher time.** Even in our small-ideas list above, every meaningful instructional improvement (exit tickets, captions transcripts, recaps) ends in *more teacher reading/grading*. The single biggest unlock is reducing the per-lesson teacher prep + review cost, not adding more student-facing toys.
3. **Defensible product moat.** Live 3D classroom + structured lesson-run + per-student response data is a uniquely complete signal stack to feed an LLM. Generic "AI lesson planners" produce a PDF. Ours can produce a *runnable script* whose effects are observable in the room and whose outcomes feed the next plan. That is a real moat the underlying primitives already give us for free.

### Capabilities, scoped by phase

The co-pilot is one persistent assistant available in the teacher HUD with at least these capabilities. Each capability is one Phase, so we can ship value continuously.

#### Phase A — "Draft a lesson"
Teacher writes an objective + grade level + duration (one sentence, one number, one number). The co-pilot proposes a `LessonRun`:
- Title + summary.
- An ordered set of `LessonStep`s using only the existing step kinds (`instruction`, `focus-board`, `private-check`, `group-work`, `timer`, `student-share`, plus `exit-ticket` if we ship Small 3 first).
- Auto-generated content per step: instruction text, check questions + choices, group prompts, exit-ticket reflection prompt.
- Suggested wall objects per `focus-board` step (a note card, a poll, a web-link resource, an image search query).

Output is **always a draft**: the teacher can edit, reorder, delete, regenerate-one-step, before saving. We never auto-run.

#### Phase B — "Fill the boards"
For each `focus-board` step, the co-pilot can populate the target anchor with proposed `WallObject`s: a title note, a poll with three plausible distractors, a vetted web-link from a teacher-approved allowlist domain set. Teacher approves per object before it materializes.

#### Phase C — "Grade the reflection"
For short-answer private-check responses and exit-ticket reflections, the co-pilot proposes a per-response **rubric tag** (e.g., "on-target," "partial," "misconception: X," "off-topic"). Teacher confirms or overrides. Aggregate rubric counts feed the recap. No grade is ever issued without teacher confirmation.

#### Phase D — "What's next?"
After a lesson ends, the co-pilot reads the recap (attendance + per-step check aggregates + rubric tags on reflections) and proposes the *next* lesson, prioritized to reteach the most common misconception. This is the loop closer. It is also the feature that justifies persisting the recap.

### Architecture sketch

- **Boundary.** The AI never mutates `ClassroomState` directly. It produces a `LessonRunDraft` (server-owned, teacher-scoped, off the room state record) that the teacher applies via existing classroom actions (`init-lesson-run`, `add-lesson-step`, etc.) one click at a time. This keeps the AI a *suggestor*, not a server-side actor, and means rollback is trivial.
- **Model layer.** One server-side adapter (`apps/api/src/services/ai.ts`) that knows about exactly one external LLM provider behind an env-flag (`AI_PROVIDER`, `AI_API_KEY`). All prompts live in code, version-controlled, with a `promptVersion` stamp on every draft so we can audit.
- **Privacy.** Student response text is summarized into rubric tags server-side; raw text is included in LLM context **only** when the teacher hits "grade with AI" on that specific response. No background fine-tuning, no automatic batch grading, no student PII leaves the API host except inside an explicit teacher-initiated request.
- **Cost control.** Every co-pilot action has a cost estimate shown to the teacher before the call ("Draft lesson: ~$0.04. Fill boards: ~$0.01/board."), backed by a token-count preview. Hard daily-per-class spend cap with admin-configurable limit.
- **Feature flag.** `ENABLE_AI_COPILOT` / `NEXT_PUBLIC_ENABLE_AI_COPILOT`, mirroring the `ENABLE_CLASSROOM_LESSONS` pattern already in use. Off by default.
- **Telemetry.** Every accept / edit / reject of an AI suggestion is logged (no student data) so we can measure quality drift over time.

### What we deliberately don't build in v1

- An LLM-driven student tutor. Students do not have access to the co-pilot in v1. The risk surface (off-task chat, hallucinated math, accidental data exfil) is too large for the value, and a student-facing tutor needs a wholly different content + safety pipeline.
- Auto-running anything live. No agent in the loop during a lesson run. The AI proposes, the teacher disposes.
- Cross-class personalization. v1 is single-class, single-teacher. Building a per-student knowledge graph is a different product.
- Voice-driven control of the room. Tempting, but voice is its own infrastructure project and competes with the live audio we already have.

### Acceptance criteria for a discovery slice

If we built only Phase A:

- A teacher in a room can open a "Draft with AI" panel, write objective + duration, get back a `LessonRunDraft` with at least 4 steps and at least one of each of `instruction`, `focus-board`, `private-check`.
- The teacher can edit any field, regenerate one step, reorder, accept the whole draft, or discard.
- Accepting the draft creates a real `LessonRun` via existing classroom actions; the lesson is then runnable identically to a hand-authored one.
- All prompts are version-stamped; one rollback path exists (delete the lesson run).
- Spend cap and feature flag both enforced server-side.
- Zero student-visible UI changes.

If Phase A is well-received, sequence B → C → D in that order — each phase is one to two weeks of work and ships independently.

### Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Teachers don't trust AI-generated content | Every output is a draft, never a live action; show prompt + model version in a "why this draft" dialog |
| LLM cost runs away | Per-class daily cap; estimate shown pre-call; small models for tagging, larger only for drafting |
| Bad content (factual errors, age-inappropriate) | All wall-object outputs use existing allowlist domains; private check questions are teacher-approved before opening; never auto-publishes |
| Student data leakage | Reflection grading is explicit per-response only; no background batch; redact names in prompts |
| Schema drift breaks generated drafts | Drafts are validated through existing Zod schemas before persistence; failed validation triggers regenerate, not error to teacher |

### Effort estimate
Phase A (the discovery slice): ~2–3 weeks of one engineer + design partnership with one teacher who agrees to be the alpha user.

---

## Big idea — Time Capsule Classroom (async ghost visits)

### One-line pitch
When a live lesson ends, the room freezes into a **time capsule** students can revisit on their own — same 3D theater, same boards, same lesson-step markers — without a teacher present and without a full video recording.

### Why this is novel (and different from everything else here)

Most edtech async modes are either (a) a Zoom recording or (b) a worksheet in an LMS. Neither preserves *spatial context*: where the class was looking, what was on the left rail vs the main board, what the room felt like when the discussion happened. Time capsules use infrastructure we already have (`WallObject` persistence, `LessonRun` step records, room manifest) to create a **walkable memory of the lesson** — closer to "visit the museum after hours" than "watch the lecture again."

This also opens a second product moment: homework, review, absent students, and parent preview ("see what we did today") without scheduling another live session.

### What a capsule contains

At `end-lesson-run` (or teacher "Seal capsule"), the server snapshots:

| Artifact | Source today | Capsule use |
| --- | --- | --- |
| Wall objects | `WallObject` collection | Frozen read-only boards (images, notes, polls with final bars, timers at end state) |
| Lesson run timeline | `ClassroomState.lessonRun` | Step markers on a HUD scrubber: "Step 3 — Group work" |
| Optional position bookmarks | New: teacher-triggered `capsule.bookmark` | 3–8 moments: "When we opened the poll," "During group work" — stores *aggregate* avatar positions (anonymized grid) not per-student video |
| Teacher voice highlights | Optional future link to transcript chunks | If server-side STT ships: key lines pinned to steps |
| Exit ticket recap | Small 3 recap | Student sees their own submission when revisiting; not classmates' |

Capsules are **read-only**. No LiveKit session required for visit (or optional lightweight presence so students see "3 classmates also reviewing now" as ghost dots — see Phase B).

### Student visit experience

1. Student opens class lobby → **Review last lesson** (or a specific sealed capsule from a list).
2. Enters the room in **ghost mode**: own avatar spawns at their last seat or default; movement works; no mic/camera publish by default.
3. Boards show frozen wall objects; interactive controls disabled except poll results (read-only), notes (read-only), links (open in new tab).
4. **Timeline scrubber** (bottom HUD): drag across lesson steps; boards optionally cross-fade to state at that step if we stored per-step wall snapshots (Phase A: single end-state only; Phase B: per-step snapshots).
5. Optional **bookmark ghosts**: faint translucent avatars showing where the class cluster was at bookmarked moments — anonymized (no names), so absent students sense "the room was full back here during discussion."
6. Student's own exit-ticket response shown in a side card if they submitted.

### Teacher experience

- **Seal capsule** button at lesson end (alongside recap). Title + optional "available until" date.
- Capsule list per room/class in teacher lobby.
- Reopen capsule for live class: "Reset boards from capsule" is out of scope v1; teacher manually rebuilds.

### Architecture sketch

- **New entity `LessonCapsule`** (Mongo): `{ id, roomId, classId, lessonRunId, sealedAt, availableUntil, title, wallObjectSnapshot[], lessonRunSnapshot, bookmarks[], settings }`.
- **Snapshot strategy:** On seal, copy wall object documents (or versioned JSON blob) — do not delete live room wall objects. Live room can be cleared separately.
- **Visit API:** `GET /v1/capsules/:capsuleId/visit` returns manifest + frozen wall objects + lesson timeline + role-filtered student data (own exit ticket only). No LiveKit token required for v1 visit (static scene).
- **Optional presence (Phase B):** `GET .../visit/session` issues a read-only LiveKit token for ghost-dot presence only (no media tracks).
- **Feature flag:** `ENABLE_LESSON_CAPSULES` / `NEXT_PUBLIC_ENABLE_LESSON_CAPSULES`.

### Phased delivery

| Phase | Ships | Value |
| --- | --- | --- |
| A | Seal at lesson end + frozen boards + step timeline scrubber + ghost visit (solo) | Absent students catch up; review without video |
| B | Teacher bookmarks + anonymized position ghosts at bookmarks | Spatial "what happened when" |
| C | Per-step wall snapshots on scrubber | Boards change as you scrub timeline |
| D | Ghost presence ("others reviewing") + teacher analytics (visit counts per step) | Social proof + teacher insight |

### Privacy and safety

- Capsules are class-scoped; same auth as room join.
- No student camera/mic recordings in capsule v1.
- Position bookmarks are **aggregated** (heatmap or anonymous dots), never named replay of who sat where unless teacher explicitly opts into named bookmarks for their own debrief (off by default for students).
- Poll results and wall notes are public-in-class by definition; private check *prompts* can appear in timeline but not peer responses.
- Retention: teacher-set expiry; default 30 days.

### What we deliberately don't build in v1

- Full session video/audio recording (different product, different compliance).
- Student edits to capsule content.
- AI-generated tour guide narration (could layer on LessonSmith later).
- Capsule authoring without a live lesson first.

### Acceptance criteria for discovery slice (Phase A)

- Teacher can seal a capsule after a lesson run ends.
- Student with class membership can open capsule in ghost mode and walk the 3D room (or 2D analog).
- All wall objects from seal moment render read-only.
- Timeline scrubber shows step titles/instructions; scrubbing updates a "current step" callout (boards static in Phase A).
- Capsule visit works with zero LiveKit connectivity.
- API test: student cannot read another student's exit-ticket text from capsule payload.

### Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Storage bloat from wall snapshots | Cap wall objects per room; compress images; expire capsules |
| Stale capsule vs live room confusion | Clear UI: "You are reviewing a sealed lesson from May 12" banner |
| Ghost mode feels lonely | Phase B presence; optional "review with a friend" invite link later |
| Safari/offline visit | Static visit is HTTP-only — easier than live LiveKit |

### Effort estimate
Phase A: ~2–3 weeks (entity + seal flow + ghost visit client mode reusing `RoomView3D` with `readOnly` prop). Parallelizable with LessonSmith Phase A — different surfaces.

---

## Big idea — World Skins (Virtual Field Trips inside the classroom)

### One-line pitch
The classroom *itself* can become Mars, a rainforest canopy, the Roman Forum, the inside of a human cell, or an artist's studio — same avatars, same lesson-run, same teacher controls, but the geometry's skin, lighting, ambient audio, and decorative props swap to a curated educational world.

### Why this sells to a school district

District procurement teams hear "3D classroom" and default to one of three mental models: Minecraft Edu (game-shaped, hard to manage), Zoom-with-avatars (just a chat skin), or VR headsets (hardware nobody owns). World Skins is the demo that flips that conversation in 90 seconds. Imagine a principal walking into a school-board meeting and saying *"Our seventh-graders had class on the surface of Mars yesterday — and answered exit tickets while they were there."* That is a budget-line story superintendents repeat.

Three district-level levers all bend toward this idea:

1. **Equity.** Physical field trips average ~$25/student and exclude up to 60% of low-income students from participation. A virtual field trip every district can run, weekly, erases that gap. This is a Title I conversation, not an extracurricular one.
2. **Standards alignment.** NGSS and Common Core both reward authentic, place-based contexts. Each skin ships with a one-page standards crosswalk (NGSS / CCSS / state-specific).
3. **Differentiation in one platform.** Districts pay for separate platforms for science simulations (Labster, Gizmos), virtual field trips (Discovery Education), and live class (Zoom). World Skins consolidates that line item.

Zoom can do polls. Zoom cannot become the inside of a volcano.

### Capabilities, scoped by phase

#### Phase A — Curated launch library (5 skins)

Pre-built skins picked for breadth across grade bands and core subjects:

| Skin | Subject anchor | Notable affordances |
| --- | --- | --- |
| **Mars Surface** | Earth/space science (5–12) | Reduced gravity walk speed, dust-storm ambient audio, rover landmark at center |
| **Cell Interior** | Biology (6–12) | Avatars rescaled to organelle-relative size; mitochondria, ribosomes, nucleus as walkable landmarks |
| **Roman Forum** | Ancient history (6–12) | Marble columns, day/night cycle toggle, monument plaques pre-tagged with web-link cards |
| **Rainforest Canopy** | Earth science / ecology (3–8) | Layered platforms (forest floor / understory / canopy), ambient bird-and-insect audio |
| **Art Studio + Critique Gallery** | Visual art (all grades) | Walls become galleries; student work auto-hangs as wall objects; gallery-walk movement pattern |

Teacher picks a skin per room or per lesson run; can switch live between steps with a ~1-second crossfade.

#### Phase B — Skin authoring kit
Districts pre-load their own skins: Erie Canal, Underground Railroad routes, local watershed, regional historical sites. Shipped as a documented JSON manifest + glTF asset bundle plus an authoring UI similar to wall-anchor placement. We supply the schema and the validator; districts and trusted partners author content under their own moderation.

#### Phase C — Skin-specific RoomObjects
Each skin can ship signature interactive props (the Mars rover you can walk around; the Roman scroll you can read; the rotatable mitochondrion). Reuses the alternate `RoomObject` entity if it has shipped.

#### Phase D — Skin marketplace / curriculum partnerships
Partnerships with PBS LearningMedia, Smithsonian Open Access, NASA, NOAA — pre-vetted free skins. Premium skins from partner publishers become an optional district add-on revenue line.

### Architecture sketch

- **Skin = manifest variant + asset pack.** New entity `RoomManifestSkin`: `{ id, slug, label, baseManifestId, overrides: { walls?, floor?, ambient?, lighting?, props? }, assets: { gltfUrls[], textureUrls[], audioUrls[] }, standardsCrosswalk }`.
- **Geometry stays the same in v1.** We override materials, lighting, skybox, ambient audio, and decorative props only — spawn points, bounds, anchor positions, and the 2D projection are unchanged. The Mars surface visually is Mars, functionally it's still our 30-seat theater. Every classroom tool that depends on geometry keeps working with zero retest.
- **2D analog** gets a themed top-down equivalent (Mars terrain map, cell schematic, forum floor plan) so accessibility / low-end users keep the field-trip frame.
- **Asset delivery** through the existing R2 signed-URL service; skin packs cached aggressively by CDN. Per-skin budget: ≤8 MB compressed for Chromebook compatibility.
- **Ambient audio** as a low-priority LiveKit track or simple CDN-streamed loop; mixed under spatial voice at low gain so it never interferes with teaching.
- **Feature flag:** `ENABLE_WORLD_SKINS` / `NEXT_PUBLIC_ENABLE_WORLD_SKINS`. Per-room override `room.settings.skinId`.

### District sales angle

- **Demo:** in a 90-second pitch, switch the classroom from default theater → Mars surface → cell interior. No competitor can do this in-browser, in real-time, with 30 students still connected.
- **Curriculum alignment:** every skin ships with a one-page NGSS / CCSS / state-standards crosswalk. Hands sales reps a ready-made objection-handler.
- **Equity argument:** virtual field trip = no permission slip, no bus, no exclusion. Pairs naturally with Title I and ESSER funding conversations.
- **Procurement flexibility:** skins can be priced as base license, as grade-band packs (K-2, 3-5, 6-8, 9-12), or as subject packs. Gives sales multiple negotiation surfaces.

### What we don't build in v1

- VR-headset support (browser only — Chromebooks first).
- Procedural / open-world skins (every shipped skin is curated and reviewed).
- Skin-specific physics beyond a movement-speed multiplier.
- Multiplayer skin authoring (one teacher / district admin at a time edits a district skin).

### Acceptance criteria for Phase A

- Teacher can pick a skin at room creation or via classroom action `set-room-skin`.
- All five launch skins render correctly in 3D and 2D with no regression on spawn points, bounds, or wall-anchor positions.
- A complete `LessonRun` executes across two different skins (one mid-run switch) with no classroom state corruption.
- Skin assets load in under 5 seconds on a baseline Chromebook (Intel N4020-class).
- High-contrast variant exists for each launch skin.
- Each skin ships with a standards crosswalk PDF in the marketing kit.

### Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Asset bloat → slow load on school Chromebooks | Per-skin asset budget; progressive load with placeholder; pre-cache on lobby entry |
| Visual distraction over teaching value | Teacher toggle to "calm skin" any time; lesson-run can lock skin during private checks |
| Cultural sensitivity (historical sites, sacred locations) | District + partner review process documented; only curated skins ship in v1; per-skin review log |
| Asset licensing | Use Creative Commons or partner-licensed assets only; track license + attribution per asset in manifest |
| Skin-geometry coupling bugs | All v1 skins share identical bounds, spawn points, anchor positions — visual changes only |
| Teacher unfamiliarity | Each skin ships with a 3-step "first lesson" template using existing `LessonRun` step kinds |

### Effort estimate
Phase A (5-skin launch): ~5–7 weeks of one engineer plus a 3D artist contractor for asset prep. This is the most expensive idea in the doc and the highest-leverage for sales. It is also the move that justifies the "3D" in 3DSpace to anyone outside the room.

---

## Big idea — Universal Access Suite (UDL / IEP / 504 / ELL)

### One-line pitch
Every student gets a persistent accommodations profile that follows them into every 3DSpace room and automatically applies their captions, fonts, audio, motion, time limits, instruction reading level, and interface complexity — so an IEP / 504 plan executes itself in every lesson, with no teacher reconfiguration.

### Why this sells to a school district

Universal Design for Learning (UDL) and IEP / 504 compliance are not nice-to-haves; they are *legal* requirements under IDEA, Section 504, and Title II of the ADA. Every US public school district RFP contains a 30+ item accessibility checklist. Districts have rejected entire LMS platforms over two failed checkboxes. Almost no synchronous video platform handles per-student accommodations natively — SPED teachers manually accommodate each lesson, which is the single largest source of SPED-teacher burnout cited in NEA surveys.

A platform that *automatically* applies every student's accommodations the moment they enter a room is something a district SPED director will champion to procurement themselves. World Skins gets the meeting. Universal Access wins the contract.

This big idea is also the umbrella that binds several of the smalls above: **Quiet Corner (Small 5)** ships in the near term; **live/translated captions (Small 2 / 7)** are deferred until server-side STT exists. Phase A should not wait on captions — use TTS on wall notes and lesson instructions, high-contrast, reduced motion, extended time, and larger HUD instead.

### Capabilities

The suite is one umbrella feature with many independently-toggleable accommodations. Each is small individually; the combined system is the moat.

#### Time and pacing
- Extended time on private checks (1.5×, 2×, untimed).
- Auto-pause lesson timer when this student opens their HUD to read.
- "Take your time" indicator on exit tickets — teacher cannot force-end the lesson run on this student until they submit.

#### Reading and language
- Text-to-speech on any wall note, instruction, poll, or check (button next to every text element).
- Speech-to-text on short-answer responses.
- Reading-level rewriter: same instruction, simplified vocabulary (routes through the same AI provider as LessonSmith; teacher pre-approves rewrite per step).
- Dyslexia-friendly font option (OpenDyslexic) for the local user only — peers never see the difference.
- Preferred-language captions (extends Small 7 across more surfaces — **deferred** with Small 2/7).

#### Vision
- High-contrast room palette + board contrast + nameplate contrast.
- HUD scale 1.0× / 1.25× / 1.5× / 2×.
- Avatar nameplate always-on (no distance-based fade) for low-vision users.
- Audio description of focused board content ("The main board shows a graph with two intersecting lines, labelled supply and demand.") — pre-authored per wall object or AI-generated and teacher-approved.
- Screen-reader landmarks on every HUD panel; verified against NVDA + VoiceOver before shipping.

#### Motion and sensory
- Reduced-motion mode (disables walk cycle, idle bob, camera-follow smoothing, crossfades).
- "No-camera-pan" focus mode (focus events highlight only; never pan the viewport).
- Lower ambient audio gain.
- Skip auto-spawn animation.
- Quiet Corner (Small 5) auto-suggested on room join for students with sensory accommodations flagged.

#### Cognitive
- Simplified HUD mode (hides advanced controls; surfaces only the current lesson step's affordances).
- One-thing-at-a-time mode: only the active step's UI is visible.
- Persistent visual schedule of upcoming steps pinned to the side.
- Larger tap targets (mobile-style sizing) regardless of viewport.

#### Behavioral and SEL
- Mood check-in on room join (private to teacher and counselor; never broadcast).
- Self-regulation timer ("I need 2 minutes") students can self-grant before re-engaging.
- Rate-limited or disabled emote spam for students who use reactions to avoid work (counselor-configurable).

### Architecture sketch

- **New entity `UserAccommodationsProfile`** on the user record. Flat schema of boolean toggles + a few numeric settings (`extendedTimeMultiplier`, `hudScale`, `preferredLanguage`, etc.).
- **Profile ownership is role-gated.** Only teachers, SPED case managers, counselors, and district admins can edit a student profile. Students cannot self-set (IEP-driven, not opt-in).
- **One client-side hook `useAccommodations()`** returns the active profile. Every UI component that should adapt reads from it. Existing HUD components are refactored to consume the hook over the implementation course.
- **Server enforcement** for time-sensitive accommodations: extended-time checks expire later for those students; force-focus messages include `respectsReducedMotion: true` flag that clients honor.
- **Audit log:** every accommodation change persists with `actor`, `reason?`, and timestamp. Districts will request this for IEP audits and OCR (Office for Civil Rights) compliance reviews.
- **District admin dashboard** (Phase D) surfaces anonymized coverage (% of students with each accommodation), audit log, RFP-ready compliance report export.
- **Feature flag:** `ENABLE_ACCOMMODATIONS_SUITE`; many sub-flags per accommodation so districts can roll out progressively.

### Phased delivery

| Phase | Ships | District sales hook |
| --- | --- | --- |
| A | Profile schema + 5 highest-impact toggles: extended time, TTS on notes, high-contrast, reduced motion, larger HUD | "IEP-aware classroom" |
| B | Reading-level rewriter + dyslexia font + audio description of boards + preferred-language captions (after server-side STT) | UDL + SPED full coverage |
| C | Mood check-in + self-regulation timer + Quiet Corner deep integration | SEL / counselor adoption |
| D | District admin dashboard: anonymized coverage report, audit log export, RFP-ready compliance pack | Procurement signoff |

### Privacy and safety

- Accommodation profiles are **PHI-adjacent**: handled as confidential student data. Never broadcast on LiveKit data channels. Server filters every API response so only the student, their teacher of record, their case manager, and authorized district staff see the profile.
- Other students never see who has which accommodation. Visual differences (font, contrast, HUD scale) apply to the local viewer only.
- Audit log is teacher/admin-only.
- District-wide reports are anonymized and aggregated; no individual student data leaves the district tenant.

### What we don't build in v1

- Direct sync with proprietary IEP platforms (Frontline, IEP Direct, SEAS) — Phase D explores bulk-import only.
- AI-generated IEP goals (legally risky; out of scope).
- Parent-side editing of accommodations (admin-only in v1).
- Automatic accommodation suggestions ("we think this student needs extended time") — too easy to bias; never proposed by the system without an authorized educator.

### Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Accommodation creep slows core UI velocity | Lock the `useAccommodations()` hook contract early so new features pick up accommodations for free |
| Self-disclosure / labeling concerns | All adaptations are silent to peers; nameplates never indicate accommodations; no "accessibility mode" badge visible |
| Teacher fatigue setting profiles individually | District admin can configure class-level defaults; bulk import path in Phase D |
| AI-generated reading-level rewrites lose nuance | Original always retrievable with one tap; teacher can lock a specific step to original-only |
| Compliance auditability | Persistent audit log with quarterly OCR-ready export |
| Family / parent objections to data handling | Clear district-tenant boundary; no cross-district analytics; documented data-handling policy in marketing kit |

### District sales angle

- **RFP-ready.** Phase D ships a one-page "accessibility compliance summary" sales reps can include with every district pitch.
- **SPED-director-led adoption.** Most district edtech procurement is driven by gen-ed needs; SPED is an afterthought. This idea inverts that: the SPED director becomes the champion.
- **Title funding alignment.** IDEA, Title III (EL), Title IV (SEL) funding streams all map cleanly onto features in this suite.
- **Reduces SPED-teacher turnover.** "We cut accommodation prep time from 45 min/lesson to 0" is the testimonial that closes deals.

### Effort estimate
Phase A: ~3–4 weeks (the foundation hook + the 5 highest-impact toggles + audit log). Phase B–D each ~2–3 weeks. Strategic note: Phase A + Quiet Corner (Small 5) on its own already covers ~60% of the district sales pitch.

---

## Alternate big-idea seeds (sketches only)

These are big enough to deserve their own planning round but are not the recommended next strategic move. Recording them here so they don't fall out of the conversation.

### Alternate A — 3D Manipulatives ("RoomObject" library)

Today, every interactive thing in the room is mounted on a wall anchor. The 3D affordance is therefore mostly seat layout — we use the spatial axis for "where you sit," not "what you do." A `RoomObject` is a free-standing 3D thing on the floor (or floating in air): a math number-line, a stack of base-10 blocks, a molecule (water, methane, DNA), a globe, a Newton's cradle, word tiles for sentence-building, a 3D solid for a geometry lesson. Teachers place from a curated library; students can be granted "touch" permission to grab, scale, rotate, color. New entity `RoomObject` with its own persistence (sibling to `WallObject`); new realtime channel `room.object.state.v1`; movement model deliberately *not* tied to physics in v1 (snap-to-grid). This is the move that justifies the 3D engine on purely pedagogical terms — for K-12 math, science, geography, and ELA, the manipulative *is* the lesson. Estimated 4–6 weeks for a 5-object launch library.

### Alternate B — Breakout pods with per-pod audio islands

Groups currently exist as a label + soft-hold zone, but everyone in the room is still in the same LiveKit audio channel — so a "group activity" is really just 30 people talking on top of each other. A pod is a named floor zone that participants enter, with two changes: (1) the 3D scene draws light partition geometry (low walls or a colored floor disc) so it's visible where pods are; (2) audio routes by pod — within a pod, participants hear each other clearly; outside, they hear a faint murmur. The teacher belongs to all pods at once and can broadcast "all-class" with a single toggle. Implementation is the harder of the two alternate big ideas because per-pod audio routing requires either LiveKit subrooms (multi-room per session) or a spatial-audio gain trick layered on the existing single-room model. Worth doing, but only once we know teachers want sustained small-group work — the `LessonRun` `group-work` step type is the leading indicator. Estimated 3–5 weeks.

## Recommendation

There are now two distinct sequences depending on what we're optimizing for. Both are defensible; the choice is a product/sales call, not a tech call.

### Sequence A — District sales priority (recommended for pitching to a district in the next quarter)

If we're optimizing for closing a district contract in the next 60–90 days:

1. **World Skins Phase A (Big idea #3)** — the demo that opens the door. 5–7 weeks; start an artist contractor in parallel with engineering. The procurement meeting needs Mars.
2. **Universal Access Suite Phase A (Big idea #4)** — the procurement signoff. 3–4 weeks. Can run partially in parallel with World Skins (different surfaces).
3. **Digital Hall Pass (Small 6)** — 2 days. Tiny effort, oversized "we replace your hall-pass vendor" sales bullet.

Total: ~8–10 weeks for a district-ready sales pack with two strategic moats, one compliance win (Universal Access without live captions), and one operational feature. **EL live captions (Small 7)** are explicitly out of this sequence until server-side STT — do not promise in RFPs.

**Deferred from Sequence A:** Translated captions (Small 7) and live captions (Small 2).

### Sequence B — Pedagogical depth priority (recommended if we already have a district pilot and need teachers to love the product)

If we already have a friendly district pilot and the goal is teacher retention / depth-of-use:

1. **Avatar reactions / emotes (Small 1)** — 2 days. Daily-loop signal.
2. **Whisper circles (Small 4)** — 3 days. Makes group work real.
3. **Exit ticket step + lesson recap (Small 3)** — 3–4 days. Closes the lesson loop and creates AI-co-pilot data surface.
4. **Time Capsule Classroom Phase A (Big idea #2)** — 2–3 weeks. Async catch-up; parent-friendly.
5. **AI Teaching Co-Pilot Phase A (Big idea #1)** — 2–3 weeks. Cuts teacher prep cost.

### Parallel-track candidates (any sequence)
- **Quiet Corner (Small 5)** — slot wherever; bundles with Universal Access Suite later.

The Sequence A vs B decision is the most important conversation to have at the next planning meeting.

### Sweet-spot first sprint (high importance × low effort)

If the team wants a defensible first slice before committing to either sequence above, the highest value-per-day items have implementation plans ready:

1. [`IMPL_EMOTES.md`](./IMPL_EMOTES.md) — Avatar reactions (Small 1, ~2 days)
2. [`IMPL_HALL_PASS.md`](./IMPL_HALL_PASS.md) — Digital hall pass (Small 6, ~2 days)
3. [`IMPL_WHISPER.md`](./IMPL_WHISPER.md) — Whisper circles (Small 4, ~3 days)
4. [`IMPL_EXIT_TICKET.md`](./IMPL_EXIT_TICKET.md) — Exit ticket step + lesson recap (Small 3, ~3–4 days)

Each is independently shippable behind its own feature flag and reuses existing systems (classroom state, lesson runs, LiveKit data channel, spatial audio). Total: ~10–12 dev-days.

### Explicitly not prioritized
- **Live captions (Small 2)** and **translated captions (Small 7)** — browser `SpeechRecognition` prerequisite is unacceptable for K–12 rollout; revisit only with server-side STT.

## Open questions for the next planning conversation

- **If we revive captions:** which server-side STT vendor (LiveKit-native, Deepgram, Azure Speech) and what is the per-class-minute cost cap? Audio-to-vendor has different FERPA/privacy implications than client-only Web Speech.
- Is the AI co-pilot allowed to make any outbound LLM call from the API host today, or do we need a separate compliance review first?
- Do we want Phase 8 of the avatar work (the recently shipped polish phase) to ship before we add more avatar surface area like emotes, or can emotes go in concurrently?
- For the recap CSV export, what's the long-term home for teacher data — the existing Mongo `RoomSession` audit table, or a new `LessonRunRecap` collection?
- Do we want any of these features behind a class-level setting (so a teacher can disable emotes / captions / AI per class), or is a global env flag enough for v1?
- For Time Capsule: is anonymized position heatmap sufficient, or do teachers need named "who was where" for their own debrief only?
- Does Whisper mode need a mandatory teacher toggle (off by default for students) for safeguarding in K-12?
- **For World Skins:** do we contract a 3D artist now or partner with an existing curriculum asset vendor (PBS, Smithsonian, NASA) for the launch library?
- **For Universal Access:** do we pursue Voluntary Product Accessibility Template (VPAT 2.4) / WCAG 2.1 AA certification before the first district pilot, or after the first paying customer?
- **For Hall Pass:** how do we surface durations across multiple rooms in a school day — a district-scope service, or just a per-room report that an admin aggregates?
- **Which sequence (A vs B) does the business want?** This is the highest-leverage decision in this whole document.
