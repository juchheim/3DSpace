"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ClassroomAction,
  ClassroomState,
  LessonRun,
  LessonSlide,
  LessonSlideDeckTheme,
  LessonSlideLayout,
  LessonStep,
  LessonStepInput,
  LessonStepKind,
  LessonStepPayload,
  RoomManifest,
  WallAnchor,
  WallObjectType
} from "@3dspace/contracts";
import { HudCard } from "./HudCard";
import { SlideDeckSlide } from "./SlideDeckSlide";
import type { LessonStepStatus } from "../lib/useLessonRun";

export type SlideImageUpload = (file: File, wallAnchorId: string) => Promise<{ attachmentId: string; url: string }>;
export type SlideImageResolve = (attachmentId: string) => Promise<string>;

type ParticipantOption = {
  id: string;
  displayName: string;
  role: "teacher" | "student";
};

type StepKindMeta = {
  kind: LessonStepKind;
  label: string;
  chip: string;
  hint: string;
};

const STEP_KINDS: StepKindMeta[] = [
  { kind: "instruction", label: "Instruction", chip: "Say", hint: "Tell the class what to do next." },
  { kind: "focus-board", label: "Focus Board", chip: "Look", hint: "Point every student at one board." },
  { kind: "slide-deck", label: "Slide Deck", chip: "Deck", hint: "Present slides on a board, at your pace." },
  { kind: "private-check", label: "Private Check", chip: "Check", hint: "Ask a question only you see answers to." },
  { kind: "group-work", label: "Group Work", chip: "Teams", hint: "Send a team to a working zone." },
  { kind: "timer", label: "Timer", chip: "Time", hint: "Run a countdown the class can see." },
  { kind: "student-share", label: "Student Share", chip: "Mic", hint: "Hand one student a board to present." },
  { kind: "exit-ticket", label: "Exit Ticket", chip: "Exit", hint: "Collect reflections before class ends." }
];

type SlideLayoutMeta = {
  layout: LessonSlideLayout;
  label: string;
  titleLabel: string;
  titlePlaceholder: string;
  bodyLabel: string;
  bodyPlaceholder: string;
  bodyMultiline: boolean;
  hasImage: boolean;
};

const SLIDE_LAYOUTS: SlideLayoutMeta[] = [
  { layout: "title", label: "Title", titleLabel: "Title", titlePlaceholder: "Photosynthesis", bodyLabel: "Subtitle", bodyPlaceholder: "How plants turn light into food", bodyMultiline: false, hasImage: false },
  { layout: "bullets", label: "Bullets", titleLabel: "Heading", titlePlaceholder: "Key ideas", bodyLabel: "Bullets — one per line", bodyPlaceholder: "Light energy is captured\nWater + CO₂ become glucose", bodyMultiline: true, hasImage: false },
  { layout: "big-fact", label: "Big fact", titleLabel: "The fact", titlePlaceholder: "90% of ocean life is unexplored", bodyLabel: "Why it matters", bodyPlaceholder: "One line of context", bodyMultiline: false, hasImage: false },
  { layout: "quote", label: "Quote", titleLabel: "Quote", titlePlaceholder: "Nothing in life is to be feared…", bodyLabel: "Attribution", bodyPlaceholder: "Marie Curie", bodyMultiline: false, hasImage: false },
  { layout: "image", label: "Image", titleLabel: "Caption", titlePlaceholder: "Optional caption", bodyLabel: "", bodyPlaceholder: "", bodyMultiline: false, hasImage: true },
  { layout: "image-text", label: "Image + text", titleLabel: "Heading", titlePlaceholder: "What do you notice?", bodyLabel: "Points — one per line", bodyPlaceholder: "Look at the top left\nWhat changed?", bodyMultiline: true, hasImage: true }
];

const DECK_THEME_OPTIONS: { theme: LessonSlideDeckTheme; label: string }[] = [
  { theme: "midnight", label: "Midnight" },
  { theme: "paper", label: "Paper" },
  { theme: "chalkboard", label: "Chalkboard" }
];

function slideLayoutMeta(layout: LessonSlideLayout): SlideLayoutMeta {
  return SLIDE_LAYOUTS.find((candidate) => candidate.layout === layout) ?? SLIDE_LAYOUTS[0]!;
}

function newSlideId() {
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function newSlide(layout: LessonSlideLayout): LessonSlide {
  return { id: newSlideId(), layout, title: "", body: "" };
}

const SHARE_TYPES: WallObjectType[] = ["note", "image.file", "whiteboard", "camera.live", "screen.live"];
const DEFAULT_GROUP_COLOR = "#389060";
const DEFAULT_GROUP_HOLD = { enabled: true, mode: "hard" as const, radiusMeters: 2.5 };

function resolveLessonWallAnchors(manifest: RoomManifest | null | undefined, wallAnchors?: WallAnchor[]) {
  if (wallAnchors?.length) return wallAnchors;
  return manifest?.wallAnchors ?? [];
}

function firstAnchorId(anchors: WallAnchor[]) {
  return anchors[0]?.id ?? "";
}

function normalizeTimerPayload(
  data: Extract<LessonStepPayload, { kind: "timer" }>["data"],
  anchors: WallAnchor[]
) {
  if (data.placement !== "wall") return data;
  const wallAnchorId = data.wallAnchorId ?? firstAnchorId(anchors);
  return wallAnchorId && wallAnchorId !== data.wallAnchorId ? { ...data, wallAnchorId } : data;
}

function firstStudentId(participants: ParticipantOption[]) {
  return participants.find((participant) => participant.role === "student")?.id ?? participants[0]?.id ?? "";
}

function defaultStep(kind: LessonStepKind, anchors: WallAnchor[], participants: ParticipantOption[]): LessonStepInput {
  const anchorId = firstAnchorId(anchors);
  const studentId = firstStudentId(participants);
  if (kind === "focus-board") {
    return {
      kind,
      title: "Look at the board",
      payload: { kind, data: { anchorId, mode: "highlight", title: "Look here", instruction: "Use this board for the next prompt." } }
    };
  }
  if (kind === "private-check") {
    return {
      kind,
      title: "Quick check",
      payload: {
        kind,
        data: {
          question: "What do you notice?",
          promptType: "short-answer",
          choices: [],
          target: { kind: "all", userIds: [] },
          wallAnchorId: anchorId || undefined,
          autoCloseOnAdvance: true
        }
      }
    };
  }
  if (kind === "group-work") {
    return {
      kind,
      title: "Group work",
      payload: {
        kind,
        data: {
          newGroup: {
            label: "Team A",
            color: DEFAULT_GROUP_COLOR,
            memberUserIds: participants.filter((p) => p.role === "student").map((p) => p.id),
            targetWallAnchorId: anchorId || undefined,
            hold: anchorId ? DEFAULT_GROUP_HOLD : undefined
          },
          releaseOnAdvance: true
        }
      }
    };
  }
  if (kind === "timer") {
    return { kind, title: "Work timer", payload: { kind, data: { durationSeconds: 60, label: "Work time", placement: "hud", autoAdvanceOnComplete: false } } };
  }
  if (kind === "slide-deck") {
    return {
      kind,
      title: "Slide deck",
      payload: {
        kind,
        data: {
          wallAnchorId: anchorId,
          theme: "midnight",
          slides: [{ ...newSlide("title"), title: "Today's lesson" }],
          spotlightBoard: true,
          removeOnAdvance: true
        }
      }
    };
  }
  if (kind === "student-share") {
    return {
      kind,
      title: "Student share",
      payload: {
        kind,
        data: {
          userId: studentId,
          wallAnchorId: anchorId,
          allowedObjectTypes: ["note"],
          acknowledgeHandIfRaised: true,
          revokeOnAdvance: true
        }
      }
    };
  }
  if (kind === "exit-ticket") {
    return {
      kind,
      title: "Exit ticket",
      payload: {
        kind,
        data: {
          reflectionPrompt: "What was the muddiest point from today's lesson?",
          includeConfidence: true,
          confidenceRange: { min: 1, max: 5 },
          requiredToEnd: false,
          autoCloseOnAdvance: true
        }
      }
    };
  }
  return { kind, title: "Instruction", payload: { kind: "instruction", data: { body: "Share the next direction with students." } } };
}

function stepKindMeta(kind: LessonStepKind): StepKindMeta {
  return STEP_KINDS.find((candidate) => candidate.kind === kind) ?? STEP_KINDS[0]!;
}

function isNonArchivedGroup(group: NonNullable<ClassroomState["groups"]>[number]) {
  return group.status !== "archived";
}

function anchorLabel(anchorId: string | undefined, anchors: WallAnchor[]) {
  if (!anchorId) return "";
  return anchors.find((anchor) => anchor.id === anchorId)?.label ?? anchorId;
}

function brokenAssetMessage(step: LessonStep, anchors: WallAnchor[], state: ClassroomState | null, participants: ParticipantOption[]) {
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  const userIds = new Set(participants.map((participant) => participant.id));
  const payload = step.payload;
  if (payload.kind === "focus-board" && !anchorIds.has(payload.data.anchorId)) return "This step references a missing board.";
  if (payload.kind === "private-check" && payload.data.wallAnchorId && !anchorIds.has(payload.data.wallAnchorId)) return "This check references a missing board.";
  if (payload.kind === "group-work") {
    if (payload.data.existingGroupId && !state?.groups.some((group) => group.id === payload.data.existingGroupId)) return "This step references a missing group.";
    if (payload.data.newGroup?.targetWallAnchorId && !anchorIds.has(payload.data.newGroup.targetWallAnchorId)) return "This group target references a missing board.";
  }
  if (payload.kind === "timer" && payload.data.placement === "wall" && !anchorIds.has(payload.data.wallAnchorId ?? "")) return "This timer references a missing board.";
  if (payload.kind === "slide-deck" && !anchorIds.has(payload.data.wallAnchorId)) return "This slide deck references a missing board.";
  if (payload.kind === "student-share") {
    if (!userIds.has(payload.data.userId)) return "This share step references a missing student.";
    if (!anchorIds.has(payload.data.wallAnchorId)) return "This share step references a missing board.";
  }
  if (payload.kind === "exit-ticket" && payload.data.wallAnchorId && !anchorIds.has(payload.data.wallAnchorId)) {
    return "This exit ticket references a missing board.";
  }
  return "";
}

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}

function stepGlance(step: LessonStep, anchors: WallAnchor[], participants: ParticipantOption[]) {
  const payload = step.payload;
  if (payload.kind === "instruction") return payload.data.body;
  if (payload.kind === "focus-board") return `${anchorLabel(payload.data.anchorId, anchors) || "Board"} · ${payload.data.mode}`;
  if (payload.kind === "private-check") {
    const type = payload.data.promptType === "multiple-choice" ? "Multiple choice" : payload.data.promptType === "confidence" ? "Confidence" : "Short answer";
    return `${type} · ${payload.data.question}`;
  }
  if (payload.kind === "group-work") {
    if (payload.data.existingGroupId) return "Reuses an existing group";
    const group = payload.data.newGroup;
    if (!group) return "Group work";
    const board = anchorLabel(group.targetWallAnchorId, anchors);
    return `${group.label} · ${group.memberUserIds.length} member${group.memberUserIds.length === 1 ? "" : "s"}${board ? ` · ${board}` : ""}`;
  }
  if (payload.kind === "timer") return `${formatTimer(payload.data.durationSeconds)} · ${payload.data.label}`;
  if (payload.kind === "slide-deck") {
    const count = payload.data.slides.length;
    return `${count} slide${count === 1 ? "" : "s"} → ${anchorLabel(payload.data.wallAnchorId, anchors) || "board"}`;
  }
  if (payload.kind === "student-share") {
    const student = participants.find((participant) => participant.id === payload.data.userId);
    return `${student?.displayName ?? "Student"} → ${anchorLabel(payload.data.wallAnchorId, anchors) || "board"}`;
  }
  return payload.data.reflectionPrompt;
}

const RUN_STATUS_LABELS: Record<LessonRun["status"], string> = {
  draft: "Draft",
  ready: "Ready",
  running: "Live",
  paused: "Paused",
  ended: "Ended",
  abandoned: "Abandoned"
};

/* ─────────────────────────────────────────────────────────────────────────────
   Compact right-HUD card — the launch point for the full-screen builder.
   ──────────────────────────────────────────────────────────────────────────── */

export function LessonScriptCard({
  run,
  loading,
  error,
  onOpenStudio
}: {
  run: LessonRun | null;
  loading: boolean;
  error: string;
  onOpenStudio: () => void;
}) {
  return (
    <HudCard
      title="Lesson Script"
      badge={run ? `${run.steps.length}` : loading ? "…" : "Off"}
      ariaLabel="Lesson script"
      defaultCollapsed
    >
      {error ? <p className="small">{error}</p> : null}
      {run ? (
        <>
          <div className="lesson-card-summary">
            <strong>{run.title}</strong>
            <span>
              {RUN_STATUS_LABELS[run.status]} · {run.steps.length} step{run.steps.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            type="button"
            className="hud-btn lesson-run-primary-btn"
            data-testid="open-lesson-studio"
            onClick={onOpenStudio}
          >
            Open lesson builder
          </button>
        </>
      ) : (
        <>
          <p className="small">Script the period step by step — boards, checks, groups, and timers.</p>
          <button
            type="button"
            className="hud-btn lesson-run-primary-btn"
            data-testid="open-lesson-studio"
            disabled={loading}
            onClick={onOpenStudio}
          >
            Plan a lesson
          </button>
        </>
      )}
    </HudCard>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Slide deck editor — filmstrip, live preview, and per-layout fields.
   ──────────────────────────────────────────────────────────────────────────── */

type SlideDeckData = Extract<LessonStepPayload, { kind: "slide-deck" }>["data"];

function StudioSlideDeckEditor({
  data,
  anchors,
  setData,
  uploadSlideImage,
  resolveSlideImage,
  slideImageUrls
}: {
  data: SlideDeckData;
  anchors: WallAnchor[];
  setData(patch: Record<string, unknown>): void;
  uploadSlideImage?: SlideImageUpload | undefined;
  resolveSlideImage?: SlideImageResolve | undefined;
  slideImageUrls?: Record<string, string> | undefined;
}) {
  const slides = data.slides;
  const [selectedSlideId, setSelectedSlideId] = useState(slides[0]?.id ?? "");
  const [localImageUrls, setLocalImageUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedIndex = Math.max(0, slides.findIndex((candidate) => candidate.id === selectedSlideId));
  const slide = slides[selectedIndex] ?? slides[0];
  const layoutMeta = slide ? slideLayoutMeta(slide.layout) : SLIDE_LAYOUTS[0]!;

  const imageUrlFor = (candidate: LessonSlide | undefined) => {
    if (!candidate?.imageAttachmentId) return undefined;
    return localImageUrls[candidate.imageAttachmentId] ?? slideImageUrls?.[candidate.imageAttachmentId];
  };

  // Hydrate download URLs for images saved in earlier sessions so thumbnails
  // and the preview render when the teacher reopens the builder.
  useEffect(() => {
    if (!resolveSlideImage) return;
    let cancelled = false;
    const missing = slides
      .map((candidate) => candidate.imageAttachmentId)
      .filter((id): id is string => Boolean(id))
      .filter((id) => !localImageUrls[id] && !slideImageUrls?.[id]);
    if (missing.length === 0) return;
    for (const attachmentId of missing) {
      void resolveSlideImage(attachmentId)
        .then((url) => {
          if (cancelled) return;
          setLocalImageUrls((current) => (current[attachmentId] ? current : { ...current, [attachmentId]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slides.map((candidate) => candidate.imageAttachmentId ?? "").join(","), resolveSlideImage]);

  function updateSlides(updater: (current: LessonSlide[]) => LessonSlide[]) {
    setData({ slides: updater(slides) });
  }

  function patchSlide(patch: Partial<Pick<LessonSlide, "layout" | "title" | "body" | "speakerNotes">>) {
    updateSlides((current) => current.map((candidate, index) => (index === selectedIndex ? { ...candidate, ...patch } : candidate)));
  }

  function addSlide() {
    const created = newSlide(slides.length === 0 ? "title" : "bullets");
    updateSlides((current) => [...current.slice(0, selectedIndex + 1), created, ...current.slice(selectedIndex + 1)]);
    setSelectedSlideId(created.id);
  }

  function duplicateSlide() {
    if (!slide) return;
    const copy: LessonSlide = { ...slide, id: newSlideId() };
    updateSlides((current) => [...current.slice(0, selectedIndex + 1), copy, ...current.slice(selectedIndex + 1)]);
    setSelectedSlideId(copy.id);
  }

  function deleteSlide() {
    if (slides.length <= 1 || !slide) return;
    const nextSelected = slides[selectedIndex + 1]?.id ?? slides[selectedIndex - 1]?.id ?? "";
    updateSlides((current) => current.filter((candidate) => candidate.id !== slide.id));
    setSelectedSlideId(nextSelected);
  }

  function moveSlide(direction: -1 | 1) {
    const target = selectedIndex + direction;
    if (target < 0 || target >= slides.length) return;
    updateSlides((current) => {
      const next = [...current];
      const [moved] = next.splice(selectedIndex, 1);
      if (moved) next.splice(target, 0, moved);
      return next;
    });
  }

  async function handleImageFile(file: File) {
    if (!uploadSlideImage || !slide) return;
    setUploading(true);
    setUploadError("");
    try {
      const anchorForUpload = data.wallAnchorId || firstAnchorId(anchors);
      const result = await uploadSlideImage(file, anchorForUpload);
      setLocalImageUrls((current) => ({ ...current, [result.attachmentId]: result.url }));
      updateSlides((current) =>
        current.map((candidate, index) => {
          if (index !== selectedIndex) return candidate;
          const { imageUrl: _droppedUrl, ...rest } = candidate;
          return { ...rest, imageAttachmentId: result.attachmentId };
        })
      );
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Upload failed — try again.");
    } finally {
      setUploading(false);
    }
  }

  function removeImage() {
    updateSlides((current) =>
      current.map((candidate, index) => {
        if (index !== selectedIndex) return candidate;
        const { imageUrl: _droppedUrl, imageAttachmentId: _droppedId, ...rest } = candidate;
        return rest;
      })
    );
  }

  if (!slide) return null;
  const slideImageUrl = imageUrlFor(slide);

  return (
    <div className="studio-field-group studio-deck" data-testid="lesson-slide-deck-editor">
      <div className="studio-row">
        <label className="studio-field">
          <span>Present on board</span>
          <select
            data-testid="lesson-deck-board"
            value={data.wallAnchorId}
            onChange={(event) => setData({ wallAnchorId: event.target.value })}
          >
            {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
          </select>
          <em>The deck appears here when this step starts.</em>
        </label>
        <div className="studio-field">
          <span>Theme</span>
          <div className="studio-deck-themes" role="radiogroup" aria-label="Deck theme">
            {DECK_THEME_OPTIONS.map((option) => (
              <button
                key={option.theme}
                type="button"
                role="radio"
                aria-checked={data.theme === option.theme}
                className={`studio-deck-theme studio-deck-theme--${option.theme}${data.theme === option.theme ? " studio-deck-theme--on" : ""}`}
                onClick={() => setData({ theme: option.theme })}
              >
                <span className="studio-deck-theme__swatch" aria-hidden />
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="studio-deck-strip" role="listbox" aria-label="Slides">
        {slides.map((candidate, index) => (
          <button
            key={candidate.id}
            type="button"
            role="option"
            aria-selected={candidate.id === slide.id}
            className={`studio-deck-thumb${candidate.id === slide.id ? " studio-deck-thumb--on" : ""}`}
            data-testid={`lesson-deck-slide-${index}`}
            onClick={() => setSelectedSlideId(candidate.id)}
          >
            <span className="studio-deck-thumb__frame" aria-hidden>
              <SlideDeckSlide slide={candidate} theme={data.theme} imageUrl={imageUrlFor(candidate)} />
            </span>
            <span className="studio-deck-thumb__num">{index + 1}</span>
          </button>
        ))}
        <button
          type="button"
          className="studio-deck-thumb studio-deck-thumb--add"
          data-testid="lesson-deck-add-slide"
          disabled={slides.length >= 40}
          onClick={addSlide}
        >
          <span aria-hidden>＋</span>
          Add slide
        </button>
      </div>

      <div className="studio-deck-stage">
        <div className="studio-deck-preview" aria-label={`Slide ${selectedIndex + 1} preview`}>
          <SlideDeckSlide slide={slide} theme={data.theme} imageUrl={slideImageUrl} />
        </div>
        <div className="studio-deck-stage__bar">
          <span className="studio-deck-stage__count">Slide {selectedIndex + 1} of {slides.length}</span>
          <span className="studio-deck-stage__tools">
            <button type="button" aria-label="Move slide earlier" disabled={selectedIndex === 0} onClick={() => moveSlide(-1)}>←</button>
            <button type="button" aria-label="Move slide later" disabled={selectedIndex === slides.length - 1} onClick={() => moveSlide(1)}>→</button>
            <button type="button" disabled={slides.length >= 40} onClick={duplicateSlide}>Duplicate</button>
            <button type="button" disabled={slides.length <= 1} onClick={deleteSlide}>Delete</button>
          </span>
        </div>
      </div>

      <div className="studio-field">
        <span>Layout</span>
        <div className="studio-deck-layouts" role="radiogroup" aria-label="Slide layout">
          {SLIDE_LAYOUTS.map((option) => (
            <button
              key={option.layout}
              type="button"
              role="radio"
              aria-checked={slide.layout === option.layout}
              className={`studio-deck-layout${slide.layout === option.layout ? " studio-deck-layout--on" : ""}`}
              onClick={() => patchSlide({ layout: option.layout })}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {layoutMeta.hasImage ? (
        <div className="studio-field">
          <span>Image</span>
          <div className="studio-deck-image-row">
            {slideImageUrl ? <img className="studio-deck-image-chip" src={slideImageUrl} alt="" /> : null}
            <button
              type="button"
              className="studio-btn"
              data-testid="lesson-deck-upload-image"
              disabled={uploading || !uploadSlideImage}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : slide.imageAttachmentId || slide.imageUrl ? "Replace image" : "Upload image"}
            </button>
            {slide.imageAttachmentId || slide.imageUrl ? (
              <button type="button" className="studio-btn" onClick={removeImage}>Remove</button>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void handleImageFile(file);
            }}
          />
          {uploadError ? <p className="studio-error">{uploadError}</p> : null}
          <em>PNG or JPG, landscape works best — the image fills the slide.</em>
        </div>
      ) : null}

      <label className="studio-field">
        <span>{layoutMeta.titleLabel}</span>
        <input
          data-testid="lesson-deck-slide-title"
          value={slide.title}
          maxLength={160}
          placeholder={layoutMeta.titlePlaceholder}
          onChange={(event) => patchSlide({ title: event.target.value })}
        />
      </label>

      {layoutMeta.bodyLabel ? (
        <label className="studio-field">
          <span>{layoutMeta.bodyLabel}</span>
          <textarea
            data-testid="lesson-deck-slide-body"
            rows={layoutMeta.bodyMultiline ? 4 : 2}
            maxLength={1200}
            value={slide.body}
            placeholder={layoutMeta.bodyPlaceholder}
            onChange={(event) => patchSlide({ body: event.target.value })}
          />
        </label>
      ) : null}

      <label className="studio-field">
        <span>Speaker notes</span>
        <textarea
          rows={2}
          maxLength={1000}
          value={slide.speakerNotes ?? ""}
          placeholder="Cues for you while presenting"
          onChange={(event) => patchSlide({ speakerNotes: event.target.value })}
        />
        <em>Only you see these — they show in the lesson run panel.</em>
      </label>

      <label className="studio-check">
        <input type="checkbox" checked={data.spotlightBoard} onChange={(event) => setData({ spotlightBoard: event.target.checked })} />
        <span>Spotlight the board so students look at it</span>
      </label>
      <label className="studio-check">
        <input type="checkbox" checked={data.removeOnAdvance} onChange={(event) => setData({ removeOnAdvance: event.target.checked })} />
        <span>Take the deck down when I advance</span>
      </label>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Step editor — the roomy center column of the builder.
   ──────────────────────────────────────────────────────────────────────────── */

function StudioStepEditor({
  step,
  manifest,
  wallAnchors,
  state,
  participants,
  onSave,
  uploadSlideImage,
  resolveSlideImage,
  slideImageUrls
}: {
  step: LessonStep;
  manifest: RoomManifest | null | undefined;
  wallAnchors: WallAnchor[];
  state: ClassroomState | null;
  participants: ParticipantOption[];
  onSave(input: { title: string; notes?: string; payload: LessonStepPayload }): Promise<void>;
  uploadSlideImage?: SlideImageUpload | undefined;
  resolveSlideImage?: SlideImageResolve | undefined;
  slideImageUrls?: Record<string, string> | undefined;
}) {
  const [title, setTitle] = useState(step.title);
  const [notes, setNotes] = useState(step.notes ?? "");
  const [payload, setPayload] = useState<LessonStepPayload>(step.payload);
  const [multipleChoiceText, setMultipleChoiceText] = useState(
    step.payload.kind === "private-check" && step.payload.data.promptType === "multiple-choice"
      ? step.payload.data.choices.map((choice) => choice.label).join("\n")
      : ""
  );
  const [whatsNextChoiceText, setWhatsNextChoiceText] = useState(
    step.payload.kind === "exit-ticket" && step.payload.data.whatsNext
      ? step.payload.data.whatsNext.choices.map((choice) => choice.label).join("\n")
      : ""
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    setTitle(step.title);
    setNotes(step.notes ?? "");
    setPayload(step.payload);
    setMultipleChoiceText(
      step.payload.kind === "private-check" && step.payload.data.promptType === "multiple-choice"
        ? step.payload.data.choices.map((choice) => choice.label).join("\n")
        : ""
    );
    setWhatsNextChoiceText(
      step.payload.kind === "exit-ticket" && step.payload.data.whatsNext
        ? step.payload.data.whatsNext.choices.map((choice) => choice.label).join("\n")
        : ""
    );
    // Only reset when the selected step changes, not on every server sync.
    // Including step.title/notes/payload would let real-time updates wipe
    // in-progress edits because new object references retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);

  useEffect(() => {
    if (payload.kind !== "timer" || payload.data.placement !== "wall" || payload.data.wallAnchorId) return;
    const anchorId = firstAnchorId(wallAnchors);
    if (!anchorId) return;
    setPayload((current) =>
      current.kind === "timer" && current.data.placement === "wall" && !current.data.wallAnchorId
        ? { ...current, data: { ...current.data, wallAnchorId: anchorId } }
        : current
    );
  }, [step.id, wallAnchors, payload.kind, payload.kind === "timer" ? payload.data.placement : null, payload.kind === "timer" ? payload.data.wallAnchorId : null]);

  const dirty = useMemo(() => {
    if (title !== step.title) return true;
    if (notes !== (step.notes ?? "")) return true;
    return JSON.stringify(payload) !== JSON.stringify(step.payload);
  }, [title, notes, payload, step]);

  function setData(patch: Record<string, unknown>) {
    setPayload((current) => ({ ...current, data: { ...current.data, ...patch } } as LessonStepPayload));
  }

  function updateMultilineChoiceText(nextValue: string) {
    setMultipleChoiceText(nextValue);
    setData({
      choices: nextValue
        .split("\n")
        .map((label, index) => ({ id: `choice-${index + 1}`, label: label.trim() }))
        .filter((choice) => choice.label)
    });
  }

  function updateWhatsNextChoiceText(nextValue: string) {
    setWhatsNextChoiceText(nextValue);
    if (payload.kind !== "exit-ticket") return;
    setData({
      whatsNext: {
        question: payload.data.whatsNext?.question ?? "",
        choices: nextValue
          .split("\n")
          .map((label, index) => ({ id: `choice-${index + 1}`, label: label.trim() }))
          .filter((choice) => choice.label)
      }
    });
  }

  function setGroupDraft(
    updater: (
      current: NonNullable<Extract<LessonStepPayload, { kind: "group-work" }>["data"]["newGroup"]>
    ) => NonNullable<Extract<LessonStepPayload, { kind: "group-work" }>["data"]["newGroup"]>
  ) {
    if (payload.kind !== "group-work") return;
    const currentGroup = payload.data.newGroup ?? {
      label: "Team",
      color: DEFAULT_GROUP_COLOR,
      memberUserIds: [],
      targetWallAnchorId: firstAnchorId(wallAnchors) || undefined,
      hold: firstAnchorId(wallAnchors) ? DEFAULT_GROUP_HOLD : undefined
    };
    setData({ existingGroupId: undefined, newGroup: updater(currentGroup) });
  }

  async function save() {
    setSaving(true);
    try {
      let nextPayload = payload;
      if (payload.kind === "timer") {
        nextPayload = { ...payload, data: normalizeTimerPayload(payload.data, wallAnchors) };
        if (nextPayload !== payload) setPayload(nextPayload);
      }
      const next: { title: string; notes?: string; payload: LessonStepPayload } = { title: title.trim() || step.title, payload: nextPayload };
      if (notes.trim()) next.notes = notes.trim();
      await onSave(next);
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  const anchors = wallAnchors;
  const students = participants.filter((participant) => participant.role === "student");
  const meta = stepKindMeta(step.kind);

  return (
    <div className="studio-editor" data-testid="lesson-step-editor">
      <div className="studio-editor__kind">
        <span className={`studio-chip studio-chip--${step.kind}`}>{meta.chip}</span>
        <div>
          <strong>{meta.label}</strong>
          <p>{meta.hint}</p>
        </div>
      </div>

      <div className="studio-field-group">
        <label className="studio-field">
          <span>Step title</span>
          <input data-testid="lesson-step-title" value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
          <em>Shows in your script outline and on the student step banner.</em>
        </label>
        <label className="studio-field">
          <span>Teacher notes</span>
          <textarea value={notes} maxLength={2000} rows={2} onChange={(event) => setNotes(event.target.value)} />
          <em>Only you see these while teaching.</em>
        </label>
      </div>

      {payload.kind === "instruction" ? (
        <div className="studio-field-group">
          <label className="studio-field">
            <span>Student instruction</span>
            <textarea
              data-testid="lesson-instruction-body"
              rows={5}
              maxLength={2000}
              value={payload.data.body}
              onChange={(event) => setData({ body: event.target.value })}
            />
            <em>Students read this on their screen when the step starts.</em>
          </label>
        </div>
      ) : null}

      {payload.kind === "focus-board" ? (
        <div className="studio-field-group">
          <div className="studio-row">
            <label className="studio-field">
              <span>Board</span>
              <select value={payload.data.anchorId} onChange={(event) => setData({ anchorId: event.target.value })}>
                {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
              </select>
            </label>
            <label className="studio-field">
              <span>Mode</span>
              <select value={payload.data.mode} onChange={(event) => setData({ mode: event.target.value })}>
                <option value="highlight">Highlight</option>
                <option value="guide">Guide</option>
                <option value="force">Force</option>
              </select>
              <em>Highlight glows, guide nudges, force snaps cameras.</em>
            </label>
          </div>
          <label className="studio-field">
            <span>Prompt</span>
            <textarea rows={3} maxLength={500} value={payload.data.instruction ?? ""} onChange={(event) => setData({ instruction: event.target.value })} />
          </label>
        </div>
      ) : null}

      {payload.kind === "private-check" ? (
        <div className="studio-field-group">
          <label className="studio-field">
            <span>Question</span>
            <textarea
              data-testid="lesson-private-check-question"
              rows={3}
              maxLength={1000}
              value={payload.data.question}
              onChange={(event) => setData({ question: event.target.value })}
            />
          </label>
          <div className="studio-row">
            <label className="studio-field">
              <span>Prompt type</span>
              <select value={payload.data.promptType} onChange={(event) => setData({ promptType: event.target.value })}>
                <option value="short-answer">Short answer</option>
                <option value="multiple-choice">Multiple choice</option>
                <option value="confidence">Confidence</option>
              </select>
            </label>
            <label className="studio-field">
              <span>Board</span>
              <select value={payload.data.wallAnchorId ?? ""} onChange={(event) => setData({ wallAnchorId: event.target.value || undefined })}>
                <option value="">No board</option>
                {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
              </select>
            </label>
          </div>
          {payload.data.promptType === "multiple-choice" ? (
            <label className="studio-field">
              <span>Choices, one per line</span>
              <textarea
                rows={4}
                value={multipleChoiceText}
                onChange={(event) => updateMultilineChoiceText(event.target.value)}
              />
            </label>
          ) : null}
          <label className="studio-check">
            <input type="checkbox" checked={payload.data.autoCloseOnAdvance} onChange={(event) => setData({ autoCloseOnAdvance: event.target.checked })} />
            <span>Close the check when I advance to the next step</span>
          </label>
        </div>
      ) : null}

      {payload.kind === "group-work" ? (
        <div className="studio-field-group">
          <label className="studio-field">
            <span>Source</span>
            <select
              value={payload.data.existingGroupId ? "existing" : "new"}
              onChange={(event) => {
                if (event.target.value === "existing") {
                  const existingGroup = (state?.groups ?? []).find(isNonArchivedGroup);
                  setData({ existingGroupId: existingGroup?.id ?? "", newGroup: undefined });
                  return;
                }
                setData({
                  existingGroupId: undefined,
                  newGroup: {
                    label: "Team A",
                    color: DEFAULT_GROUP_COLOR,
                    memberUserIds: students.map((participant) => participant.id),
                    targetWallAnchorId: firstAnchorId(wallAnchors) || undefined,
                    hold: firstAnchorId(wallAnchors) ? DEFAULT_GROUP_HOLD : undefined
                  }
                });
              }}
            >
              <option value="new">Create lesson group</option>
              <option value="existing" disabled={!state?.groups.some(isNonArchivedGroup)}>Reuse existing group</option>
            </select>
          </label>
          {payload.data.existingGroupId ? (
            <>
              <label className="studio-field">
                <span>Group</span>
                <select value={payload.data.existingGroupId} onChange={(event) => setData({ existingGroupId: event.target.value, newGroup: undefined })}>
                  {(state?.groups ?? []).filter(isNonArchivedGroup).map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}
                </select>
              </label>
              {(() => {
                const existingGroup = (state?.groups ?? []).find((group) => group.id === payload.data.existingGroupId);
                if (!existingGroup) return <p className="studio-hint">This step references a missing group.</p>;
                const boardLabel = anchorLabel(existingGroup.targetWallAnchorId, wallAnchors);
                return (
                  <p className="studio-hint">
                    {existingGroup.memberUserIds.length} member{existingGroup.memberUserIds.length === 1 ? "" : "s"}
                    {boardLabel ? ` · board: ${boardLabel}` : ""}
                    {existingGroup.hold?.enabled ? " · locked in room" : ""}
                  </p>
                );
              })()}
            </>
          ) : null}
          {payload.data.newGroup ? (
            <>
              <div className="studio-row">
                <label className="studio-field">
                  <span>Group label</span>
                  <input
                    value={payload.data.newGroup?.label ?? ""}
                    onChange={(event) => setGroupDraft((current) => ({ ...current, label: event.target.value }))}
                  />
                </label>
                <label className="studio-field">
                  <span>Color</span>
                  <input
                    value={payload.data.newGroup?.color ?? DEFAULT_GROUP_COLOR}
                    onChange={(event) => setGroupDraft((current) => ({ ...current, color: event.target.value }))}
                  />
                </label>
              </div>
              <label className="studio-field">
                <span>Work board</span>
                <select
                  value={payload.data.newGroup.targetWallAnchorId ?? ""}
                  onChange={(event) =>
                    setGroupDraft((current) => ({
                      ...current,
                      targetWallAnchorId: event.target.value || undefined,
                      hold: event.target.value ? current.hold ?? DEFAULT_GROUP_HOLD : current.hold
                    }))
                  }
                >
                  <option value="">No board</option>
                  {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
                </select>
              </label>
              <div className="studio-field">
                <span>Members</span>
                <div className="studio-member-grid">
                  {students.map((participant) => {
                    const members = payload.data.newGroup?.memberUserIds ?? [];
                    const checked = members.includes(participant.id);
                    return (
                      <label key={participant.id} className={`studio-member${checked ? " studio-member--on" : ""}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const nextMembers = event.target.checked ? [...members, participant.id] : members.filter((id) => id !== participant.id);
                            setGroupDraft((current) => ({ ...current, memberUserIds: nextMembers }));
                          }}
                        />
                        <span>{participant.displayName}</span>
                      </label>
                    );
                  })}
                  {students.length === 0 ? <p className="studio-hint">No students are in the room yet — members can be added once they join.</p> : null}
                </div>
              </div>
              <label className="studio-check">
                <input
                  type="checkbox"
                  checked={Boolean(payload.data.newGroup.hold?.enabled)}
                  onChange={(event) =>
                    setGroupDraft((current) => ({
                      ...current,
                      hold: event.target.checked ? { ...(current.hold ?? DEFAULT_GROUP_HOLD), enabled: true, mode: "hard", radiusMeters: current.hold?.radiusMeters ?? DEFAULT_GROUP_HOLD.radiusMeters } : undefined
                    }))
                  }
                />
                <span>Lock students into the group zone</span>
              </label>
              {payload.data.newGroup.hold?.enabled ? (
                <label className="studio-field studio-field--narrow">
                  <span>Zone radius (m)</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    step={0.5}
                    value={payload.data.newGroup.hold.radiusMeters}
                    onChange={(event) =>
                      setGroupDraft((current) => ({
                        ...current,
                        hold: {
                          enabled: true,
                          mode: "hard",
                          radiusMeters: Number(event.target.value)
                        }
                      }))
                    }
                  />
                </label>
              ) : null}
              {payload.data.newGroup.targetWallAnchorId ? (
                <p className="studio-hint">Students move to a working zone near this board when the step starts.</p>
              ) : null}
            </>
          ) : null}
          <label className="studio-check">
            <input type="checkbox" checked={payload.data.releaseOnAdvance} onChange={(event) => setData({ releaseOnAdvance: event.target.checked })} />
            <span>Release the group when I advance</span>
          </label>
        </div>
      ) : null}

      {payload.kind === "timer" ? (
        <div className="studio-field-group">
          <div className="studio-row">
            <label className="studio-field">
              <span>Label</span>
              <input value={payload.data.label} maxLength={80} onChange={(event) => setData({ label: event.target.value })} />
            </label>
            <label className="studio-field">
              <span>Seconds</span>
              <input type="number" min={5} max={3600} value={payload.data.durationSeconds} onChange={(event) => setData({ durationSeconds: Number(event.target.value) })} />
            </label>
          </div>
          <div className="studio-row">
            <label className="studio-field">
              <span>Placement</span>
              <select
                value={payload.data.placement}
                onChange={(event) => {
                  const placement = event.target.value;
                  if (placement === "wall") {
                    setData({
                      placement,
                      wallAnchorId: payload.data.wallAnchorId ?? (firstAnchorId(anchors) || undefined)
                    });
                  } else {
                    setData({ placement });
                  }
                }}
              >
                <option value="hud">HUD</option>
                <option value="wall">Wall</option>
              </select>
              <em>HUD floats on every screen; wall pins it to a board.</em>
            </label>
            {payload.data.placement === "wall" ? (
              <label className="studio-field">
                <span>Board</span>
                <select value={payload.data.wallAnchorId ?? firstAnchorId(anchors)} onChange={(event) => setData({ wallAnchorId: event.target.value })}>
                  {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
                </select>
              </label>
            ) : null}
          </div>
          <label className="studio-check">
            <input type="checkbox" checked={payload.data.autoAdvanceOnComplete} onChange={(event) => setData({ autoAdvanceOnComplete: event.target.checked })} />
            <span>Auto-advance when the timer completes</span>
          </label>
        </div>
      ) : null}

      {payload.kind === "slide-deck" ? (
        <StudioSlideDeckEditor
          data={payload.data}
          anchors={anchors}
          setData={setData}
          uploadSlideImage={uploadSlideImage}
          resolveSlideImage={resolveSlideImage}
          slideImageUrls={slideImageUrls}
        />
      ) : null}

      {payload.kind === "student-share" ? (
        <div className="studio-field-group">
          <div className="studio-row">
            <label className="studio-field">
              <span>Student</span>
              <select value={payload.data.userId} onChange={(event) => setData({ userId: event.target.value })}>
                {students.map((participant) => <option key={participant.id} value={participant.id}>{participant.displayName}</option>)}
              </select>
            </label>
            <label className="studio-field">
              <span>Board</span>
              <select value={payload.data.wallAnchorId} onChange={(event) => setData({ wallAnchorId: event.target.value })}>
                {anchors.map((anchor) => <option key={anchor.id} value={anchor.id}>{anchor.label}</option>)}
              </select>
            </label>
          </div>
          <div className="studio-field">
            <span>They may post</span>
            <div className="studio-member-grid">
              {SHARE_TYPES.map((type) => {
                const checked = payload.data.allowedObjectTypes.includes(type);
                return (
                  <label key={type} className={`studio-member${checked ? " studio-member--on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const next = event.target.checked
                          ? [...payload.data.allowedObjectTypes, type]
                          : payload.data.allowedObjectTypes.filter((candidate) => candidate !== type);
                        setData({ allowedObjectTypes: next });
                      }}
                    />
                    <span>{type}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <label className="studio-check">
            <input type="checkbox" checked={payload.data.revokeOnAdvance} onChange={(event) => setData({ revokeOnAdvance: event.target.checked })} />
            <span>Revoke board access when I advance</span>
          </label>
        </div>
      ) : null}

      {payload.kind === "exit-ticket" ? (
        <div className="studio-field-group">
          <label className="studio-field">
            <span>Reflection prompt</span>
            <textarea
              data-testid="lesson-exit-ticket-prompt"
              rows={3}
              maxLength={500}
              value={payload.data.reflectionPrompt}
              onChange={(event) => setData({ reflectionPrompt: event.target.value })}
            />
          </label>
          <label className="studio-field">
            <span>Board for prompt</span>
            <select
              value={payload.data.wallAnchorId ?? ""}
              onChange={(event) => setData({ wallAnchorId: event.target.value || undefined })}
            >
              <option value="">No board (HUD only)</option>
              {anchors.map((anchor) => (
                <option key={anchor.id} value={anchor.id}>{anchor.label}</option>
              ))}
            </select>
          </label>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={payload.data.includeConfidence}
              onChange={(event) => setData({ includeConfidence: event.target.checked })}
            />
            <span>Include confidence rating (1–5)</span>
          </label>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={payload.data.whatsNext != null}
              onChange={(event) => {
                if (event.target.checked) {
                  setData({ whatsNext: { question: "", choices: [] } });
                } else {
                  setData({ whatsNext: undefined });
                  setWhatsNextChoiceText("");
                }
              }}
            />
            <span>Include &ldquo;what&apos;s next&rdquo; question</span>
          </label>
          {payload.data.whatsNext != null ? (
            <>
              <label className="studio-field">
                <span>What&apos;s next question</span>
                <input
                  maxLength={500}
                  value={payload.data.whatsNext.question}
                  onChange={(event) => {
                    if (payload.kind !== "exit-ticket") return;
                    setData({ whatsNext: { question: event.target.value, choices: payload.data.whatsNext?.choices ?? [] } });
                  }}
                />
              </label>
              <label className="studio-field">
                <span>Choices, one per line (2–6)</span>
                <textarea
                  rows={4}
                  value={whatsNextChoiceText}
                  onChange={(event) => updateWhatsNextChoiceText(event.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="studio-check">
            <input
              type="checkbox"
              checked={payload.data.requiredToEnd}
              onChange={(event) => setData({ requiredToEnd: event.target.checked })}
            />
            <span>Required before the lesson can end</span>
          </label>
          <label className="studio-check">
            <input
              type="checkbox"
              checked={payload.data.autoCloseOnAdvance}
              onChange={(event) => setData({ autoCloseOnAdvance: event.target.checked })}
            />
            <span>Auto-close when I advance</span>
          </label>
        </div>
      ) : null}

      <div className="studio-editor__savebar">
        {dirty ? (
          <span className="studio-savebar-status studio-savebar-status--dirty" data-testid="lesson-step-save-state">Unsaved edits</span>
        ) : savedAt > 0 ? (
          <span className="studio-savebar-status" data-testid="lesson-step-save-state">Saved</span>
        ) : (
          <span className="studio-savebar-status" data-testid="lesson-step-save-state" />
        )}
        <button type="button" className="studio-btn studio-btn--primary" data-testid="save-lesson-step" disabled={saving} onClick={() => void save()}>
          {saving ? "Saving…" : "Save step"}
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Full-screen Lesson Builder.
   ──────────────────────────────────────────────────────────────────────────── */

export function LessonStudio({
  run,
  state,
  manifest,
  wallAnchors: wallAnchorsProp,
  participants,
  loading,
  error,
  runAction,
  stepStatus,
  onClose,
  uploadSlideImage,
  resolveSlideImage,
  slideImageUrls
}: {
  run: LessonRun | null;
  state: ClassroomState | null;
  manifest?: RoomManifest | null | undefined;
  wallAnchors?: WallAnchor[];
  participants: ParticipantOption[];
  loading: boolean;
  error: string;
  runAction(action: ClassroomAction): Promise<unknown>;
  stepStatus(stepIndex: number): LessonStepStatus;
  onClose: () => void;
  uploadSlideImage?: SlideImageUpload | undefined;
  resolveSlideImage?: SlideImageResolve | undefined;
  slideImageUrls?: Record<string, string> | undefined;
}) {
  const [title, setTitle] = useState(run?.title ?? "Untitled lesson");
  const [selectedStepId, setSelectedStepId] = useState("");
  const [busy, setBusy] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const wallAnchors = useMemo(() => resolveLessonWallAnchors(manifest, wallAnchorsProp), [manifest, wallAnchorsProp]);

  const selectedStep = useMemo(
    () => run?.steps.find((step) => step.id === selectedStepId) ?? run?.steps[0] ?? null,
    [run, selectedStepId]
  );
  const brokenMessage = selectedStep ? brokenAssetMessage(selectedStep, wallAnchors, state, participants) : "";

  useEffect(() => {
    if (run?.title) setTitle(run.title);
    if (run?.steps.length && !run.steps.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(run.steps[0]?.id ?? "");
    }
  }, [run, selectedStepId]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  async function execute(label: string, action: ClassroomAction) {
    setBusy(label);
    try {
      const result = await runAction(action);
      if (action.type === "add-lesson-step") {
        const next = result as { lessonRun?: { steps?: Array<{ id: string }> } | null };
        const newStepId = next?.lessonRun?.steps?.at(-1)?.id;
        if (newStepId) setSelectedStepId(newStepId);
      }
    } finally {
      setBusy("");
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    // Keep typing/shortcuts inside the builder from steering the avatar or
    // toggling room HUD modes underneath the overlay.
    event.stopPropagation();
  }

  const editable = !run || (run.status !== "ended" && run.status !== "abandoned");
  const canStart = Boolean(run && (run.status === "draft" || run.status === "ready") && run.steps.length > 0);
  const isLive = run?.status === "running" || run?.status === "paused";
  const totalTimerSeconds = (run?.steps ?? []).reduce(
    (total, step) => (step.payload.kind === "timer" ? total + step.payload.data.durationSeconds : total),
    0
  );
  const anchors = wallAnchors;
  const students = participants.filter((participant) => participant.role === "student");
  const issues = (run?.steps ?? [])
    .map((step, index) => ({ step, index, message: brokenAssetMessage(step, wallAnchors, state, participants) }))
    .filter((entry) => entry.message);

  return (
    <div className="lesson-studio-backdrop" role="presentation">
      <div
        ref={rootRef}
        className="lesson-studio"
        role="dialog"
        aria-modal="true"
        aria-label="Lesson builder"
        data-testid="lesson-studio"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        {!run ? (
          <>
            <header className="studio-header">
              <div className="studio-header__lead">
                <p className="studio-kicker">Lesson Builder</p>
              </div>
              <div className="studio-header__actions">
                <button type="button" className="studio-btn" data-testid="lesson-studio-done" onClick={onClose}>
                  Back to room
                </button>
              </div>
            </header>
            <div className="studio-create">
              <div className="studio-create__form">
                <h2>Plan your lesson script</h2>
                <p>
                  Write the period as a sequence of steps. When you run the script, each step
                  directs the room — boards light up, checks open, groups form, timers start.
                </p>
                {error ? <p className="studio-error">{error}</p> : null}
                <label className="studio-field">
                  <span>Lesson title</span>
                  <input
                    data-testid="lesson-run-title"
                    value={title}
                    maxLength={160}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="studio-btn studio-btn--primary"
                  data-testid="init-lesson-run"
                  disabled={busy === "init" || loading}
                  onClick={() => void execute("init", { type: "init-lesson-run", title: title.trim() || "Untitled lesson" })}
                >
                  Create lesson
                </button>
              </div>
              <div className="studio-create__kinds" aria-hidden="true">
                {STEP_KINDS.map((meta) => (
                  <div key={meta.kind} className="studio-kind-preview">
                    <span className={`studio-chip studio-chip--${meta.kind}`}>{meta.chip}</span>
                    <div>
                      <strong>{meta.label}</strong>
                      <p>{meta.hint}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="studio-header">
              <div className="studio-header__lead">
                <p className="studio-kicker">Lesson Builder</p>
                <input
                  className="studio-title-input"
                  data-testid="lesson-run-title"
                  value={title}
                  maxLength={160}
                  aria-label="Lesson title"
                  onBlur={() => {
                    if (title.trim() && title.trim() !== run.title) {
                      void execute("title", { type: "set-lesson-run-title", title: title.trim() });
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                  }}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <div className="studio-meta">
                  <span className={`studio-status studio-status--${run.status}`}>{RUN_STATUS_LABELS[run.status]}</span>
                  <span>{run.steps.length} step{run.steps.length === 1 ? "" : "s"}</span>
                  {totalTimerSeconds > 0 ? <span>{formatTimer(totalTimerSeconds)} of timed work</span> : null}
                </div>
              </div>
              <div className="studio-header__actions">
                {canStart ? (
                  <button
                    type="button"
                    className="studio-btn studio-btn--primary"
                    data-testid="lesson-studio-start"
                    disabled={busy === "start"}
                    onClick={() => {
                      void execute("start", { type: "start-lesson-run" }).then(() => onClose());
                    }}
                  >
                    Start lesson
                  </button>
                ) : null}
                <button type="button" className="studio-btn" data-testid="lesson-studio-done" onClick={onClose}>
                  Back to room
                </button>
              </div>
            </header>
            {error ? <p className="studio-error studio-error--bar">{error}</p> : null}
            {isLive ? (
              <p className="studio-live-banner">
                This script is live — saved edits reach students immediately.
              </p>
            ) : null}
            <div className="studio-body">
              <aside className="studio-outline" aria-label="Lesson script outline">
                <div className="studio-rail-section" aria-label="Add lesson step">
                  <p className="studio-rail-heading">Add a step</p>
                  <div className="studio-add-list">
                    {STEP_KINDS.map((meta) => (
                      <button
                        key={meta.kind}
                        type="button"
                        className="studio-add-btn"
                        data-testid={`add-lesson-step-${meta.kind}`}
                        disabled={busy === meta.kind || !editable}
                        onClick={() => void execute(meta.kind, { type: "add-lesson-step", step: defaultStep(meta.kind, wallAnchors, participants) })}
                      >
                        <span className={`studio-chip studio-chip--${meta.kind}`}>{meta.chip}</span>
                        <span className="studio-add-btn__text">
                          <strong>{meta.label}</strong>
                          <em>{meta.hint}</em>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="studio-rail-section">
                  <p className="studio-rail-heading">Script · {run.steps.length}</p>
                  {run.steps.length === 0 ? (
                    <p className="studio-hint">No steps yet. Add the first thing the class should do.</p>
                  ) : null}
                  <ol className="studio-step-list" data-testid="lesson-step-list">
                    {run.steps.map((step, index) => {
                      const status = stepStatus(index);
                      const meta = stepKindMeta(step.kind);
                      const broken = Boolean(brokenAssetMessage(step, wallAnchors, state, participants));
                      return (
                        <li
                          key={step.id}
                          className={`studio-step ${selectedStep?.id === step.id ? "studio-step--selected" : ""} studio-step--${status}`}
                          data-testid={`lesson-step-${index}`}
                        >
                          <button type="button" className="studio-step__main" onClick={() => setSelectedStepId(step.id)}>
                            <span className="studio-step__num">{index + 1}</span>
                            <span className="studio-step__text">
                              <strong>
                                {step.title}
                                {broken ? <i className="studio-step__warn" title="This step references something missing" /> : null}
                              </strong>
                              <em>{stepGlance(step, wallAnchors, participants) || meta.label}</em>
                            </span>
                            <span className={`studio-chip studio-step__chip studio-chip--${step.kind}`}>{meta.chip}</span>
                          </button>
                          <span className="studio-step__tools">
                            <button
                              type="button"
                              aria-label={`Move step ${index + 1} up`}
                              disabled={index === 0 || !editable}
                              onClick={() => void execute(`up-${step.id}`, { type: "move-lesson-step", from: index, to: index - 1 })}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              aria-label={`Move step ${index + 1} down`}
                              disabled={index === run.steps.length - 1 || !editable}
                              onClick={() => void execute(`down-${step.id}`, { type: "move-lesson-step", from: index, to: index + 1 })}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove step ${index + 1}`}
                              disabled={!editable}
                              onClick={() => void execute(`remove-${step.id}`, { type: "remove-lesson-step", stepId: step.id })}
                            >
                              ✕
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              </aside>

              <section className="studio-main" aria-label="Step editor">
                {brokenMessage ? (
                  <p className="studio-error" data-testid="lesson-broken-step">{brokenMessage}</p>
                ) : null}
                {selectedStep ? (
                  <StudioStepEditor
                    key={selectedStep.id}
                    step={selectedStep}
                    manifest={manifest}
                    wallAnchors={wallAnchors}
                    state={state}
                    participants={participants}
                    onSave={(input) => execute(`save-${selectedStep.id}`, { type: "update-lesson-step", stepId: selectedStep.id, ...input })}
                    uploadSlideImage={uploadSlideImage}
                    resolveSlideImage={resolveSlideImage}
                    slideImageUrls={slideImageUrls}
                  />
                ) : (
                  <div className="studio-empty">
                    <h3>Build the first step</h3>
                    <p>
                      Pick a step type from the left rail. A good opener is an
                      <strong> Instruction</strong> that tells students what to do when class starts.
                    </p>
                  </div>
                )}
              </section>

              <aside className="studio-context" aria-label="Room context">
                <div className="studio-rail-section">
                  <p className="studio-rail-heading">Boards in this room</p>
                  {anchors.length === 0 ? <p className="studio-hint">No boards available.</p> : null}
                  <ul className="studio-context-list">
                    {anchors.map((anchor) => (
                      <li key={anchor.id}>
                        <span className="studio-dot studio-dot--board" />
                        {anchor.label}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="studio-rail-section">
                  <p className="studio-rail-heading">Here now</p>
                  {participants.length === 0 ? <p className="studio-hint">Nobody has joined yet.</p> : null}
                  <ul className="studio-context-list">
                    {participants.map((participant) => (
                      <li key={participant.id}>
                        <span className={`studio-dot ${participant.role === "teacher" ? "studio-dot--teacher" : "studio-dot--student"}`} />
                        {participant.displayName}
                        {participant.role === "teacher" ? <em> · teacher</em> : null}
                      </li>
                    ))}
                  </ul>
                  {students.length === 0 ? (
                    <p className="studio-hint">Steps that target students fill in once they join.</p>
                  ) : null}
                </div>
                <div className="studio-rail-section" data-testid="lesson-studio-flight-check">
                  <p className="studio-rail-heading">Flight check</p>
                  {issues.length === 0 ? (
                    <p className="studio-flight-ok">
                      {run.steps.length === 0
                        ? "Add steps to check the script."
                        : "Every step points at a live board, group, and student."}
                    </p>
                  ) : (
                    <ul className="studio-flight-list">
                      {issues.map((issue) => (
                        <li key={issue.step.id}>
                          <button type="button" onClick={() => setSelectedStepId(issue.step.id)}>
                            Step {issue.index + 1}: {issue.message}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
