"use client";

import { anchorHasOccupyingWallObject, anchorSupportsCreateOption, fileInputAcceptForAnchor, isOccupyingWallObjectStatus } from "@3dspace/room-engine";
import { useEffect, useMemo, useState } from "react";
import type { ClassroomBoardAccessGrant, Role, RoomManifest, WallObject, WallObjectType } from "@3dspace/contracts";
import type { ApiIdentity } from "../lib/identity";
import { WallObjectCard, type WallObjectControlAction } from "./WallObjectCard";
import { HudCard } from "./HudCard";

type CreateType = "file" | "note" | "timer" | "poll" | "link";

const FORM_TYPES: { id: CreateType; label: string }[] = [
  { id: "file",  label: "File"  },
  { id: "note",  label: "Note"  },
  { id: "timer", label: "Timer" },
  { id: "poll",  label: "Poll"  },
  { id: "link",  label: "Link"  },
];

export function AnchorPanel({
  identity,
  roomId,
  manifest,
  wallObjects,
  assetUrls,
  wallMediaStreams,
  canCreate,
  canManage,
  role,
  activeBoardGrant,
  loading,
  error,
  onCreateFile,
  onCreateNote,
  onCreateTimer,
  onCreatePoll,
  onCreateLink,
  onPinCamera,
  onPinMicrophone,
  onShareScreen,
  onRemove,
  onStopShare,
  onControl,
  onModerate
}: {
  identity: ApiIdentity;
  roomId: string;
  manifest: RoomManifest;
  wallObjects: WallObject[];
  assetUrls: Record<string, string>;
  wallMediaStreams: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>;
  canCreate: boolean;
  canManage: boolean;
  role: Role;
  activeBoardGrant?: ClassroomBoardAccessGrant | null | undefined;
  loading: boolean;
  error: string;
  onCreateFile(input: { anchorId: string; file: File; title: string; altText?: string | undefined; caption?: string | undefined }): Promise<void>;
  onCreateNote(input: { anchorId: string; title: string; text: string }): Promise<void>;
  onCreateTimer(input: { anchorId: string; title: string; seconds: number }): Promise<void>;
  onCreatePoll(input: { anchorId: string; title: string; question: string; choices: string[] }): Promise<void>;
  onCreateLink(input: { anchorId: string; title: string; url: string }): Promise<void>;
  onPinCamera(anchorId: string): Promise<void>;
  onPinMicrophone(anchorId: string): Promise<void>;
  onShareScreen(anchorId: string): Promise<void>;
  onRemove(objectId: string): Promise<void>;
  onStopShare(objectId: string): Promise<void>;
  onControl(objectId: string, action: WallObjectControlAction, positionSeconds?: number, choiceId?: string): Promise<void>;
  onModerate(objectId: string, action: "approve" | "reject"): Promise<void>;
}) {
  const [selectedAnchor, setSelectedAnchor] = useState(activeBoardGrant?.wallAnchorId ?? manifest.wallAnchors[0]?.id ?? "");
  const [selectedType, setSelectedType] = useState<CreateType | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollChoices, setPollChoices] = useState(["", ""]);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [busy, setBusy] = useState("");

  const objectsByAnchor = useMemo(() => {
    const groups = new Map<string, WallObject[]>();
    for (const object of wallObjects) {
      if (!isOccupyingWallObjectStatus(object.status)) continue;
      groups.set(object.wallAnchorId, [...(groups.get(object.wallAnchorId) ?? []), object]);
    }
    return groups;
  }, [wallObjects]);

  const grantAllowedTypes = useMemo(() => new Set<WallObjectType>(activeBoardGrant?.allowedObjectTypes ?? []), [activeBoardGrant?.allowedObjectTypes]);
  const grantRestricted = role === "student" && Boolean(activeBoardGrant);

  const selectedAnchorOccupied = useMemo(
    () => anchorHasOccupyingWallObject(wallObjects, selectedAnchor),
    [selectedAnchor, wallObjects]
  );

  const selectedAnchorData = useMemo(
    () => manifest.wallAnchors.find((anchor) => anchor.id === selectedAnchor),
    [manifest.wallAnchors, selectedAnchor]
  );

  const anchorWithinGrant = !grantRestricted || selectedAnchor === activeBoardGrant?.wallAnchorId;
  const optionAllowedByGrant = (option: CreateType | "camera" | "microphone" | "screen") => {
    if (!grantRestricted) return true;
    if (!anchorWithinGrant) return false;
    if (option === "file") {
      return ["image.file", "video.file", "audio.file"].some((type) => grantAllowedTypes.has(type as WallObjectType));
    }
    if (option === "note") return grantAllowedTypes.has("note");
    if (option === "timer") return grantAllowedTypes.has("timer");
    if (option === "poll") return grantAllowedTypes.has("poll");
    if (option === "link") return grantAllowedTypes.has("web.link") || grantAllowedTypes.has("web.embed");
    if (option === "camera") return grantAllowedTypes.has("camera.live");
    if (option === "microphone") return grantAllowedTypes.has("microphone.live");
    return grantAllowedTypes.has("browser-tab.live") || grantAllowedTypes.has("screen.live");
  };

  const availableFormTypes = useMemo(
    () => FORM_TYPES.filter(({ id }) => selectedAnchorData && anchorSupportsCreateOption(selectedAnchorData, id) && optionAllowedByGrant(id)),
    [selectedAnchorData, grantRestricted, anchorWithinGrant, activeBoardGrant?.allowedObjectTypes]
  );

  const showCamera = selectedAnchorData ? anchorSupportsCreateOption(selectedAnchorData, "camera") && optionAllowedByGrant("camera") : false;
  const showMicrophone = selectedAnchorData ? anchorSupportsCreateOption(selectedAnchorData, "microphone") && optionAllowedByGrant("microphone") : false;
  const showScreen = selectedAnchorData ? anchorSupportsCreateOption(selectedAnchorData, "screen") && optionAllowedByGrant("screen") : false;
  const fileAccept = selectedAnchorData ? fileInputAcceptForAnchor(selectedAnchorData) : "";

  useEffect(() => {
    if (selectedType && !availableFormTypes.some(({ id }) => id === selectedType)) {
      setSelectedType(null);
    }
  }, [availableFormTypes, selectedType]);

  useEffect(() => {
    if (grantRestricted && activeBoardGrant?.wallAnchorId && selectedAnchor !== activeBoardGrant.wallAnchorId) {
      setSelectedAnchor(activeBoardGrant.wallAnchorId);
    }
  }, [activeBoardGrant?.wallAnchorId, grantRestricted, selectedAnchor]);

  const hasObjects = wallObjects.length > 0;

  function toggleType(type: CreateType) {
    setSelectedType((current) => (current === type ? null : type));
  }

  async function run(label: string, action: () => Promise<void>) {
    if (selectedAnchorOccupied) return;
    setBusy(label);
    try {
      await action();
    } finally {
      setBusy("");
    }
  }

  async function submitFile() {
    if (!file) return;
    const title = fileTitle.trim() || file.name;
    await run("file", async () => {
      await onCreateFile({ anchorId: selectedAnchor, file, title, altText: title });
      setFile(null);
      setFileTitle("");
    });
  }

  async function submitNote() {
    const text = noteText.trim();
    if (!text) return;
    await run("note", async () => {
      await onCreateNote({ anchorId: selectedAnchor, title: text.slice(0, 60), text });
      setNoteText("");
    });
  }

  async function submitTimer() {
    await run("timer", async () => {
      await onCreateTimer({ anchorId: selectedAnchor, title: `${timerMinutes}m timer`, seconds: Math.max(1, timerMinutes) * 60 });
    });
  }

  async function submitPoll() {
    const question = pollQuestion.trim();
    const choices = pollChoices.map((choice) => choice.trim()).filter(Boolean);
    if (!question || choices.length < 2) return;
    await run("poll", async () => {
      await onCreatePoll({ anchorId: selectedAnchor, title: question.slice(0, 60), question, choices });
      setPollQuestion("");
      setPollChoices(["", ""]);
    });
  }

  const pollChoiceFieldsValid = pollChoices.filter((choice) => choice.trim()).length >= 2;

  async function submitLink() {
    const url = linkUrl.trim();
    if (!url) return;
    let title = url;
    try { title = new URL(url).hostname; } catch { title = url; }
    await run("link", async () => {
      await onCreateLink({ anchorId: selectedAnchor, title, url });
      setLinkUrl("");
    });
  }

  return (
    <HudCard title="Wall" badge={loading ? "…" : `${wallObjects.length} obj`} ariaLabel="Wall objects">

      {canCreate ? (
        <>
          {/* Anchor selector */}
          {manifest.wallAnchors.length > 1 ? (
            <select
              className="anchor-select-compact"
              value={selectedAnchor}
              disabled={grantRestricted}
              onChange={(e) => setSelectedAnchor(e.target.value)}
              aria-label="Target anchor"
            >
              {manifest.wallAnchors.map((a) => (
                <option key={a.id} value={a.id}>{a.label}</option>
              ))}
            </select>
          ) : null}

          {selectedAnchorOccupied ? (
            <p className="small">Remove the current item on this display before adding another.</p>
          ) : null}
          {grantRestricted ? <p className="small">Your teacher granted sharing on {selectedAnchorData?.label ?? "this board"}.</p> : null}

          {/* Form type selector */}
          {availableFormTypes.length > 0 || showCamera || showMicrophone || showScreen ? (
          <div className="content-type-bar">
            {availableFormTypes.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`content-type-btn${selectedType === id ? " selected" : ""}`}
                disabled={selectedAnchorOccupied || Boolean(busy)}
                onClick={() => toggleType(id)}
              >
                {label}
              </button>
            ))}
            {showCamera ? (
              <button
                type="button"
                className="content-type-btn"
                disabled={selectedAnchorOccupied || Boolean(busy)}
                onClick={() => void run("camera", () => onPinCamera(selectedAnchor))}
              >
                {busy === "camera" ? "…" : "Cam"}
              </button>
            ) : null}
            {showMicrophone ? (
              <button
                type="button"
                className="content-type-btn"
                disabled={selectedAnchorOccupied || Boolean(busy)}
                onClick={() => void run("mic", () => onPinMicrophone(selectedAnchor))}
              >
                {busy === "mic" ? "…" : "Mic"}
              </button>
            ) : null}
            {showScreen ? (
              <button
                type="button"
                className="content-type-btn"
                disabled={selectedAnchorOccupied || Boolean(busy)}
                onClick={() => void run("screen", () => onShareScreen(selectedAnchor))}
              >
                {busy === "screen" ? "…" : "Screen"}
              </button>
            ) : null}
          </div>
          ) : (
            <p className="small">This display does not accept wall content.</p>
          )}

          {/* File form */}
          {selectedType === "file" && (
            <div className="content-form">
              <label>
                File
                <input
                  type="file"
                  accept={fileAccept || undefined}
                  onChange={(e) => setFile(e.currentTarget.files?.[0] ?? null)}
                />
              </label>
              <label>
                Title
                <input value={fileTitle} onChange={(e) => setFileTitle(e.target.value)} placeholder={file?.name ?? "Title"} />
              </label>
              <button type="button" className="hud-btn" disabled={selectedAnchorOccupied || !file || Boolean(busy)} onClick={() => void submitFile()}>
                {busy === "file" ? "Adding…" : "Add file"}
              </button>
            </div>
          )}

          {/* Note form */}
          {selectedType === "note" && (
            <div className="content-form">
              <label>
                Note
                <input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Pinned note text" />
              </label>
              <button type="button" className="hud-btn" disabled={selectedAnchorOccupied || !noteText.trim() || Boolean(busy)} onClick={() => void submitNote()}>
                {busy === "note" ? "Adding…" : "Add note"}
              </button>
            </div>
          )}

          {/* Timer form */}
          {selectedType === "timer" && (
            <div className="content-form">
              <div className="content-form-row">
                <label>
                  Minutes
                  <input type="number" min={1} max={120} value={timerMinutes} onChange={(e) => setTimerMinutes(Number(e.target.value))} />
                </label>
                <button type="button" className="hud-btn" disabled={selectedAnchorOccupied || Boolean(busy)} onClick={() => void submitTimer()}>
                  {busy === "timer" ? "…" : "Add"}
                </button>
              </div>
            </div>
          )}

          {/* Poll form */}
          {selectedType === "poll" && (
            <div className="content-form">
              <label>
                Question
                <input value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} placeholder="Poll question" />
              </label>
              <div className="content-form-poll-choices">
                <span className="small">Choices</span>
                {pollChoices.map((choice, index) => (
                  <div key={index} className="content-form-row">
                    <input
                      value={choice}
                      onChange={(e) =>
                        setPollChoices((current) => current.map((entry, entryIndex) => (entryIndex === index ? e.target.value : entry)))
                      }
                      placeholder={`Choice ${index + 1}`}
                    />
                    {pollChoices.length > 2 ? (
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`Remove choice ${index + 1}`}
                        onClick={() => setPollChoices((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                      >
                        −
                      </button>
                    ) : null}
                  </div>
                ))}
                {pollChoices.length < 6 ? (
                  <button type="button" className="secondary" onClick={() => setPollChoices((current) => [...current, ""])}>
                    Add choice
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                className="hud-btn"
                disabled={selectedAnchorOccupied || !pollQuestion.trim() || !pollChoiceFieldsValid || Boolean(busy)}
                onClick={() => void submitPoll()}
              >
                {busy === "poll" ? "Adding…" : "Add poll"}
              </button>
            </div>
          )}

          {/* Link form */}
          {selectedType === "link" && (
            <div className="content-form">
              <label>
                URL
                <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://example.edu/resource" />
              </label>
              <button type="button" className="hud-btn" disabled={selectedAnchorOccupied || !linkUrl.trim() || Boolean(busy)} onClick={() => void submitLink()}>
                {busy === "link" ? "Adding…" : "Add link"}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="small">{role === "student" ? "Wait for your teacher to grant board access." : "Wall creation is teacher-controlled."}</p>
      )}

      {/* Objects grouped by anchor */}
      {hasObjects && (
        <div style={{ marginTop: canCreate ? "0.5rem" : 0, borderTop: canCreate ? "1px solid var(--line)" : "none", paddingTop: canCreate ? "0.5rem" : 0 }}>
          {manifest.wallAnchors.map((anchor) => {
            const objects = objectsByAnchor.get(anchor.id) ?? [];
            if (objects.length === 0) return null;
            return (
              <div key={anchor.id} className="hud-anchor-group">
                <div className="hud-anchor-label">{anchor.label}</div>
                {objects.map((object) => (
                  <WallObjectCard
                    key={object.id}
                    object={object}
                    compact
                    canManage={canManage}
                    currentUserId={identity.userId}
                    assetUrl={assetUrls[object.id]}
                    videoStream={wallMediaStreams[object.id]?.videoStream}
                    audioStream={wallMediaStreams[object.id]?.audioStream}
                    onRemove={(objectId) => void onRemove(objectId)}
                    onStopShare={(objectId) => void onStopShare(objectId)}
                    onControl={(objectId, action, positionSeconds, choiceId) => void onControl(objectId, action, positionSeconds, choiceId)}
                    onModerate={(objectId, action) => void onModerate(objectId, action)}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {error ? <div className="alert" style={{ marginTop: "0.5rem" }}>{error}</div> : null}
    </HudCard>
  );
}
