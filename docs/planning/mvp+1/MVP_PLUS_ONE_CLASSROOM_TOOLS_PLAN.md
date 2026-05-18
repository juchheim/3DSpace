# MVP+1 Classroom Tools Plan

Last updated: 2026-05-17
Branch target: `mvp-plus-one`

## Purpose

This document recreates and expands the lost MVP+1 classroom-tools plan. It covers the teacher-facing classroom controls that sit on top of the existing MVP room, avatar, LiveKit, wall-anchor, and MVP+1 wall-object systems.

MVP gave us shared presence: teachers and students can join a 3D room, move as avatars, use camera/microphone, and fall back to a 2D analog. MVP+1 wall media gave us durable and live materials on wall anchors through `WallObject`.

Classroom tools should make those primitives teachable:

- Students can raise a hand and request help or board access.
- Teachers can grant a student controlled access to a board to share work.
- Teachers can create private checks/quizzes whose responses are visible only to the teacher.
- Teachers can create groups, position students in group zones, and hold them there for an activity.
- Teachers can spotlight a board or wall object and guide student attention to it.
- Teachers eventually need a full lesson-planning and presentation mode that sequences boards, media, quizzes, groups, and transitions.

The goal is not to create a generic LMS. The goal is to make the live 3D classroom usable for structured teaching moments without bloating the room engine.

## Existing Foundation

The current `mvp-plus-one` branch already provides:

- Authenticated class, room, membership, invite, and role concepts.
- `RoomManifest` geometry with wall planes, wall anchors, spawn points, bounds, and 2D projection.
- LiveKit media and data channels for active-room state.
- `WallObject` APIs, persistence, realtime upsert/remove/playback messages, and 3D/2D rendering.
- `WallAttachment` signed-upload flow for file-backed wall objects.
- Room settings for wall-object creation policy, student uploads, student live shares, web links, embeds, and active object limits.
- Teacher-only enforcement for room and wall object management.
- `Roster` and room HUD surfaces that can become teacher classroom controls.

Classroom tools should reuse these foundations. New durable classroom state should live outside the static room manifest, just like wall objects do.

## Product Principles

1. Keep the teacher in control of class flow.
2. Keep student sharing explicit, time-bound, and scoped to a board or activity.
3. Keep private learning data private by default.
4. Keep avatar movement real-time and transient; do not persist or replay live movement as classroom state.
5. Use reliable realtime only for low-frequency classroom events; avatar state remains its own data-channel stream.
6. Make every feature work in both 3D and 2D mode.
7. Favor reversible classroom controls: grant, revoke, focus, release, close.
8. Do not hide server-side authorization behind frontend-only role checks.

## Feature 1: Raise Hand And Board Access

### User Story

A student needs help or wants to share work. They raise their hand from the room UI. The teacher sees the request in a people/classroom panel and can acknowledge it, dismiss it, or grant the student access to a specific board.

When board access is granted, the student can place allowed content on that board for the duration or until revoked. Sharing should use the existing wall-object system: file upload, note, poll-like response, camera pin, microphone pin, or screen share depending on room policy and teacher grant.

### Student Experience

- Student clicks `Raise hand`.
- Optional note field: "Need help with problem 3" or "Can I share my screen?"
- Student sees current status: `Raised`, `Acknowledged`, `Board access granted`, `Closed`.
- If granted board access, student sees a clear board-sharing panel:
  - Which board is granted.
  - What they can create.
  - Expiration or teacher-controlled revoke status.
  - Stop sharing / finish button.

### Teacher Experience

- Teacher people panel shows raised hands first.
- Each request includes student name, role/group, note, time raised, and status.
- Teacher can:
  - Acknowledge.
  - Dismiss/close.
  - Bring self/student focus to that student.
  - Grant board access to a selected wall anchor.
  - Revoke board access.
  - Remove/moderate student-created wall objects.

### Board Access Semantics

Board access is a scoped permission grant, not a role change.

Grant fields:

- `roomId`
- `userId`
- `wallAnchorId`
- `allowedObjectTypes`
- `allowedSourceKinds`
- `expiresAt`
- `createdByUserId`
- `status`: `active`, `revoked`, `expired`
- `reason` or `requestId`

The backend must check grants when a student creates a wall object. A teacher can still create/manage any allowed teacher object.

### Recommended First Slice

- Raise hand request.
- Teacher acknowledge/close.
- Teacher grants one student access to one board for file, note, camera, mic, or screen share according to room settings.
- Backend enforces grant scope.
- UI exposes granted board actions only while grant is active.

## Feature 2: Private Quizzes / Private Checks

### User Story

A teacher asks a comprehension question. Students answer privately. Only the teacher sees individual responses. Students may see only their own submitted state, or optionally an anonymized aggregate if the teacher chooses to share it.

This should support "quick checks" first and grow into richer multi-question quizzes later.

### MVP+1 Private Check Types

Start with:

- Multiple choice.
- Short answer.
- Confidence rating.

Future extensions:

- Multi-select.
- Numeric answer.
- Ordered response.
- Matching.
- Image/file response.
- Multi-question quiz with sections.

### Teacher Experience

- Create a check with:
  - Question/prompt.
  - Type.
  - Choices if needed.
  - Optional target group or all students.
  - Optional timer.
  - Visibility: `teacher-only` by default.
- Open the check.
- Watch response count and individual responses live.
- Close/reopen.
- Optionally share anonymized aggregate to a wall board.
- Export later as classroom data.

### Student Experience

- Student sees an active prompt in the room HUD.
- Student answers once unless the teacher reopens or allows edits.
- Student sees `Submitted` and maybe their submitted answer.
- Student never sees classmates' individual responses.

### Privacy Rules

- Individual responses are teacher-visible only.
- Student clients should not receive classmates' response payloads over realtime.
- Realtime messages may announce "state changed" or aggregate counts, but not full private response data to students.
- Backend list endpoints must filter responses by actor role:
  - Teacher receives all responses.
  - Student receives prompt metadata plus their own response.

### Wall Integration

A private check can optionally be anchored to a board:

- Prompt appears on the board.
- Students answer in HUD to avoid overcrowding the wall UI.
- Teacher-only response table stays in teacher panel.
- Optional public result card can be created as a separate wall object after closing.

## Feature 3: Groups With Positioning And Hold Zones

### User Story

A teacher divides students into groups and sends each group to an area of the room. Students remain in or near the assigned area during the group activity. The teacher can release them afterward.

Groups are not just labels. They are spatial classroom state.

### Teacher Experience

- Create group:
  - Label.
  - Color.
  - Target zone or target position.
  - Optional assigned board.
  - Optional lock radius.
- Assign students manually from the people panel.
- Send group to zone.
- Hold group in zone.
- Release group.
- Jump/focus camera to group.

### Student Experience

- Student sees group assignment and destination.
- Avatar receives a group color/tag.
- Student can move within the allowed zone while active.
- If hold is enabled, movement outside the zone is clamped or guided back.
- Student receives clear messaging when released.

### Hold Semantics

There are two levels:

- Soft hold: UI nudges the student back to the group zone and shows boundary feedback.
- Hard hold: movement code clamps avatar position to a radius around the group target.

The first implementation should use soft hold or limited hard hold inside the client movement constraints. Backend does not need to validate every avatar position because avatar state is transient and high-frequency.

### Group Data

Group fields:

- `id`
- `roomId`
- `label`
- `color`
- `memberUserIds`
- `targetPosition`
- `targetWallAnchorId`
- `hold`: `{ enabled, radiusMeters, mode }`
- `status`: `active`, `released`, `archived`
- `createdByUserId`
- `updatedAt`

Group membership should be included in classroom state and reflected in roster, avatars, and 2D map.

## Feature 4: Highlight Board / Force Focus

### User Story

The teacher wants everyone to look at a board. They highlight it, and students get guided to the board in both 3D and 2D. For important moments, the teacher can force focus.

### Teacher Experience

- Select wall anchor or wall object.
- Click `Focus class`.
- Optional title/instruction, e.g. "Look at the diagram."
- Optional mode:
  - Highlight only.
  - Guide students.
  - Force focus.
- Clear focus when done.

### Student Experience

- Highlight appears on the board.
- Student gets a focus callout with `Go to focus`.
- In 2D mode, map pans/frames the board.
- In 3D mode, camera or avatar guidance points toward the board.
- If force focus is active, the view switches or navigates to the relevant perspective unless accessibility settings opt out.

### Focus State

Focus fields:

- `targetType`: `wall-anchor` or `wall-object`
- `anchorId`
- `objectId`
- `title`
- `instruction`
- `mode`: `highlight`, `guide`, `force`
- `createdByUserId`
- `startedAt`
- `expiresAt`

Focus state is durable enough to hydrate when a student joins mid-activity, but changes should broadcast immediately over reliable realtime.

## Feature 5: Full Lesson Planning And Presentation

### Status

This was planned but not implemented and needs fresh design. Treat it as the next layer above classroom tools, not as a one-off UI.

### Product Goal

Teachers should be able to build a lesson before class and present it live. A lesson can sequence wall objects, prompts, quizzes, group work, board focus, student sharing, and teacher narration.

### Lesson Planning Concepts

Entities:

- `LessonPlan`: teacher-owned reusable plan for a class or room template.
- `LessonStep`: ordered step with type, title, instructions, duration, and assets.
- `LessonRun`: live execution of a plan in a room session.
- `LessonRunState`: current step, timing, completion, and per-step classroom state.

Step types:

- Welcome/instruction.
- Present board/object.
- Play media.
- Private check/quiz.
- Student board share.
- Group work.
- Discussion.
- Timer.
- Exit ticket.

### Presentation Mode

Teacher presenter mode should provide:

- Current step and next step.
- One-click advance/back.
- Auto-create or spotlight wall objects.
- Open/close private checks.
- Send students to groups.
- Grant/revoke board access.
- Show speaker notes to teacher only.
- Persist run timeline for later review.

Student presentation mode should provide:

- Clear current instruction.
- Active focus target.
- Active response prompts.
- Group assignment.
- Minimal clutter.

### Lesson Planning MVP Slice

Do not start with a full LMS-style authoring system. Start with a "live lesson script" that can be created inside a room:

1. Teacher creates a simple ordered list of steps.
2. Each step can focus a board, show an instruction, start a timer, open a private check, or activate groups.
3. Teacher can run through steps live.
4. Lesson run state is persisted separately from room manifest and wall objects.

Later, promote scripts into reusable templates.

## Classroom State Model

Classroom tools need a central state record per active room:

- `roomId`
- `version`
- `helpRequests`
- `boardAccessGrants`
- `privateChecks`
- `groups`
- `spotlight`
- `lessonRun`
- `createdAt`
- `updatedAt`

Use optimistic versioning like wall objects. High-frequency avatar positions stay out of classroom state.

## Realtime Model

Recommended messages:

- `classroom.state.changed.v1`: announces a newer persisted version; clients refresh if stale.
- `classroom.state.v1`: optional full-state broadcast for trusted payloads.
- `classroom.focus.v1`: low-latency focus change.
- `classroom.help.v1`: hand/request update.
- `classroom.group.v1`: group update.
- `classroom.check.changed.v1`: private-check metadata changed.

Private quiz responses should not be blindly broadcast to all clients. Prefer a changed-version event plus role-filtered API refresh.

## UI Surfaces

### People Panel

Teacher-visible panel:

- Participants.
- Raised hands.
- Group assignment.
- Camera/mic status.
- Board access controls.
- Quick actions: focus student, grant board, assign group.

Student-visible panel:

- Current self status.
- Group assignment.
- Raise/cancel hand.
- Active grant.

### Classroom Panel

Teacher classroom controls:

- Help queue.
- Board access grants.
- Private checks.
- Groups.
- Focus/spotlight.
- Lesson run controls later.

### Board / Wall Surface

- Highlight ring for focused board.
- Badges for granted student share.
- Optional prompt/result cards.
- Respect existing wall object occupancy rules unless a lesson step intentionally replaces content.

### 2D Analog

Everything visible in 3D must have a 2D representation:

- Hand/group badges on participants.
- Focused board highlight.
- Group zones.
- Board access status.
- Active prompt list.

## Authorization

Teacher-only:

- Create/close private checks.
- View all private responses.
- Create/modify groups.
- Enable group hold.
- Grant/revoke board access.
- Force focus.
- Start/advance lesson run.

Student-allowed:

- Raise/cancel own hand.
- Submit own private-check response.
- Create wall objects only when room policy or teacher board grant allows it.
- Stop own live share.

Backend enforcement is mandatory.

## Data Retention

Default retention:

- Help requests: store in classroom state during active room, archive optional room events.
- Board grants: store with expiration and audit trail.
- Private checks: persist prompts and responses for teacher review.
- Groups: persist during room and optionally save as reusable class group sets later.
- Lesson runs: persist timeline and step outcomes.

Privacy-sensitive data such as private responses should not be exposed in generic room event feeds.

## Accessibility And Safety

- Do not make forced camera movement disorienting without an escape or accessibility preference.
- Provide 2D equivalent for every spatial control.
- Use text labels with color-coded groups.
- Clearly indicate when a student's camera, mic, or screen is being shared to a board.
- Student board sharing must have visible stop controls.
- Teacher grants should expire automatically.

## Acceptance Criteria

Classroom tools MVP+1 is complete when:

- A student can raise and cancel a hand.
- Teacher can see raised hands in a people/classroom panel and acknowledge/close them.
- Teacher can grant one student board access and revoke it.
- Student can create allowed wall content only on a granted board.
- Teacher can create a private check, students can answer, and only teacher sees all responses.
- Teacher can create groups, assign students, position groups, and release them.
- Group colors/labels appear in roster, 3D avatars, and 2D analog.
- Teacher can highlight/focus a board for all students.
- All state hydrates correctly for a student joining mid-activity.
- Avatar movement remains real-time and is never overwritten by classroom state hydration.
- API tests cover authorization and privacy boundaries.
- Playwright covers teacher/student hand raise, board access, private check, groups, and focus flows.

## Open Questions

- Should private checks be room-scoped only, or also class/lesson-scoped for reuse?
- Should group sets persist across rooms/classes?
- Should hard hold be allowed for all students, or only during specific teacher-led modes?
- Should force focus auto-move avatars, only move camera, or only show guidance?
- How should lesson plan authoring integrate with existing wall object limits and one-object-per-board rules?
- What exports are needed for private quiz responses and lesson runs?
