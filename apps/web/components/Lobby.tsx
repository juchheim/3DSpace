"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClassRecord, FreeForAllRoomSummary, Invite, RoomObjectsSettings, RoomRecord, RoomSettings } from "@3dspace/contracts";
import { parseRoomSettings } from "@3dspace/contracts";
import { acceptInvite, createClass, createInvite, createRoom, deleteRoom, joinFreeForAllRoom, listClasses, listFreeForAllRooms, listRooms, patchRoom } from "../lib/api";
import type { ApiIdentity } from "../lib/identity";
import { AuthGate } from "../lib/auth";
import { CLIENT_TUNING } from "../lib/config";
import { inviteJoinUrl } from "../lib/invite";
import { getStoredFreeForAllPassword, setStoredFreeForAllPassword } from "../lib/freeForAllPassword";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";
import { CopyRoomInviteButton } from "./CopyRoomInviteButton";

// ── Room type registry ──────────────────────────────────────────────────────
// To add a new room type: (1) extend the union, (2) add an entry to ROOM_TYPES,
// (3) add a case to renderRoomTypeSteps() below.
type RoomType = "classroom" | "workforce-training" | "free-for-all";

const ROOM_TYPES: { value: RoomType; label: string; description: string }[] = [
  { value: "classroom",          label: "Classroom",          description: "Live 3D sessions with students and a shareable invite code." },
  { value: "workforce-training", label: "Workforce Training", description: "Immersive training sessions for teams and organizations." },
  { value: "free-for-all",       label: "Free-for-All",       description: "Open, social rooms. Shared password to create or join." },
];

const ROOM_TYPE_FORM_DEFAULTS: Record<RoomType, { className: string; roomName: string }> = {
  classroom: { className: "Physics 101", roomName: "Wave Lab" },
  "workforce-training": { className: "Acme Field Ops", roomName: "Compliance Refresher" },
  "free-for-all": { className: "Open Space", roomName: "Hangout" },
};

const ROOM_TYPE_JOIN_COPY: Record<
  RoomType,
  { guestSingular: string; hostSingular: string; joinButtonLabel: string }
> = {
  classroom: { guestSingular: "student", hostSingular: "teacher", joinButtonLabel: "Join class room" },
  "workforce-training": { guestSingular: "trainee", hostSingular: "instructor", joinButtonLabel: "Join training" },
  "free-for-all": { guestSingular: "participant", hostSingular: "host", joinButtonLabel: "Browse rooms" },
};

const DEFAULT_ROOM_TYPE: RoomType = CLIENT_TUNING.enableFreeForAll ? "free-for-all" : "classroom";

function FreeForAllRoomBrowser({
  identity,
  busy,
  setBusy,
  setError,
  manageableClassIds,
  password,
  onPasswordChange,
  onRoomDeleted
}: {
  identity: ApiIdentity;
  busy: boolean;
  setBusy: (v: boolean) => void;
  setError: (v: string) => void;
  manageableClassIds: Set<string>;
  password: string;
  onPasswordChange: (value: string) => void;
  onRoomDeleted?: () => Promise<void>;
}) {
  const [rooms, setRooms] = useState<FreeForAllRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await listFreeForAllRooms(identity);
        if (!cancelled) setRooms(result.rooms);
      } catch {
        // silently ignore poll errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    pollRef.current = setInterval(() => void load(), 30_000);
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [identity.userId]);

  async function join(room: FreeForAllRoomSummary) {
    const isCreator = manageableClassIds.has(room.classId);
    if (!isCreator && !password.trim()) {
      setError("Enter the Free-for-All password to join.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await joinFreeForAllRoom(identity, room.id, isCreator ? undefined : password.trim());
      if (password.trim()) setStoredFreeForAllPassword(password.trim());
      window.location.href = `/rooms/${room.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join room.");
      setBusy(false);
    }
  }

  async function remove(room: FreeForAllRoomSummary) {
    if (!window.confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteRoom(identity, room.id);
      setRooms((previous) => previous.filter((candidate) => candidate.id !== room.id));
      if (onRoomDeleted) await onRoomDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete room.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="lb-join-hint">Loading rooms…</p>;
  if (rooms.length === 0) {
    return <p className="lb-join-hint">No open rooms right now — create one above to get started!</p>;
  }
  return (
    <div className="lb-ffa-rooms">
      <p className="lb-join-hint">Open rooms — enter the shared password to join (not required for rooms you created):</p>
      <div className="lb-field">
        <label className="lb-label lb-label-tx" htmlFor="lb-ffa-join-password">Room password</label>
        <input
          id="lb-ffa-join-password"
          className="lb-inp"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          placeholder="Shared Free-for-All password"
        />
      </div>
      {rooms.map((room) => (
        <div key={room.id} className="lb-room-item">
          <div className="lb-room-pulse" />
          <span className="lb-room-name">{room.name}</span>
          <span className="lb-room-class">{room.participantCount} online</span>
          <div className="lb-room-acts">
            <button
              className="lb-btn lb-btn-sec lb-btn-sm"
              disabled={busy}
              onClick={() => void join(room)}
            >
              Join
            </button>
            {manageableClassIds.has(room.classId) ? (
              <button
                className="lb-btn lb-btn-dan lb-btn-sm"
                disabled={busy}
                onClick={() => void remove(room)}
              >
                Delete
              </button>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Lobby() {
  const { identity, loaded, clerkEnabled, signedIn } = usePersistentIdentity();
  const [roomType, setRoomType] = useState<RoomType>(DEFAULT_ROOM_TYPE);
  const [className, setClassName] = useState(ROOM_TYPE_FORM_DEFAULTS[DEFAULT_ROOM_TYPE].className);
  const [roomName, setRoomName] = useState(ROOM_TYPE_FORM_DEFAULTS[DEFAULT_ROOM_TYPE].roomName);
  const [ffaPassword, setFfaPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"code" | "link" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState<string | null>(null);
  const [draftHallpass, setDraftHallpass] = useState<RoomSettings["hallpass"] | null>(null);
  const [draftRoomObjects, setDraftRoomObjects] = useState<RoomObjectsSettings | null>(null);
  const manageableClassIds = useMemo(
    () =>
      new Set(
        classes
          .filter((record) => record.teacherUserId === identity.userId)
          .map((record) => record.id)
      ),
    [classes, identity.userId]
  );

  function handleRoomTypeChange(next: RoomType) {
    const currentDefaults = ROOM_TYPE_FORM_DEFAULTS[roomType];
    const nextDefaults = ROOM_TYPE_FORM_DEFAULTS[next];

    if (className === currentDefaults.className || !className.trim()) {
      setClassName(nextDefaults.className);
    }
    if (roomName === currentDefaults.roomName || !roomName.trim()) {
      setRoomName(nextDefaults.roomName);
    }

    setRoomType(next);
    setCreatedInvite(null);
    setCopyStatus(null);
    setError("");
  }

  useEffect(() => {
    document.body.classList.add("lobby-dark");
    return () => { document.body.classList.remove("lobby-dark"); };
  }, []);

  useEffect(() => {
    if (roomType !== "free-for-all") return;
    const stored = getStoredFreeForAllPassword();
    if (stored) setFfaPassword(stored);
  }, [roomType]);

  async function refresh() {
    try {
      const [nextClasses, nextRooms] = await Promise.all([listClasses(identity), listRooms(identity)]);
      setClasses(nextClasses);
      setRooms(nextRooms);
    } catch {
      setClasses([]);
      setRooms([]);
    }
  }

  useEffect(() => {
    if (!loaded) return;
    if (clerkEnabled && !signedIn) return;
    void refresh();
  }, [identity.userId, loaded, clerkEnabled, signedIn]);

  async function createRoomOfType(type: RoomType) {
    if (type === "free-for-all" && !ffaPassword.trim()) {
      setError("Enter the Free-for-All password to create a room.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const classRecord = await createClass(identity, className);
      const room = await createRoom(identity, classRecord.id, roomName, type, {
        ...(type === "free-for-all" ? { freeForAllPassword: ffaPassword.trim() } : {})
      });
      if (type === "free-for-all") setStoredFreeForAllPassword(ffaPassword.trim());
      const invite = await createInvite(identity, classRecord.id, { role: "student", roomId: room.room.id });
      setCreatedInvite(invite);
      setCopyStatus(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create room.");
    } finally {
      setBusy(false);
    }
  }

  async function joinInvite() {
    setBusy(true);
    setError("");
    try {
      const accepted = await acceptInvite(identity, inviteCode.trim());
      if (!accepted.roomId) throw new Error("Invite was accepted, but no room was attached.");
      window.location.href = `/rooms/${accepted.roomId}?invite=${encodeURIComponent(inviteCode.trim())}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join invite.");
    } finally {
      setBusy(false);
    }
  }

  function canManageRoom(room: RoomRecord) {
    const classRecord = classes.find((record) => record.id === room.classId);
    return classRecord?.teacherUserId === identity.userId;
  }

  function openRoomSettings(room: RoomRecord) {
    const parsed = parseRoomSettings(room.settings);
    setSettingsOpen(room.id);
    setDraftHallpass(parsed.hallpass);
    setDraftRoomObjects(parsed.roomObjects);
  }

  function closeRoomSettings() {
    setSettingsOpen(null);
    setDraftHallpass(null);
    setDraftRoomObjects(null);
  }

  async function saveRoomSettings(roomId: string) {
    if (!draftHallpass && !draftRoomObjects) return;
    setBusy(true);
    setError("");
    try {
      const settings: Partial<RoomSettings> = {};
      if (draftHallpass) settings.hallpass = draftHallpass;
      if (draftRoomObjects) settings.roomObjects = draftRoomObjects;
      await patchRoom(identity, roomId, { settings });
      await refresh();
      closeRoomSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRoom(room: RoomRecord) {
    if (!window.confirm(`Delete "${room.name}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteRoom(identity, room.id);
      if (createdInvite?.roomId === room.id) setCreatedInvite(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete room.");
    } finally {
      setBusy(false);
    }
  }

  async function copyInvite(target: "code" | "link") {
    if (!createdInvite?.roomId) return;
    const text = target === "code" ? createdInvite.code : inviteJoinUrl(createdInvite.roomId, createdInvite.code);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(target);
      window.setTimeout(() => setCopyStatus(null), 2_000);
    } catch {
      setError("Unable to copy to clipboard. Select the text and copy manually.");
    }
  }

  const hasRoom = Boolean(createdInvite?.roomId);
  const authDisabled = clerkEnabled && !signedIn;
  const joinCopy = ROOM_TYPE_JOIN_COPY[roomType];

  // ── Type-specific step panels ────────────────────────────────────────────
  // Add a new case here (and to ROOM_TYPES above) to support additional room types.
  function renderRoomTypeSteps() {
    switch (roomType) {
      case "classroom":
        return (
          <div className="lb-steps-grid">

            {/* Step 1: Create */}
            <div className="lb-step-col">
              <div className="lb-step-hd">
                <div className={`lb-step-badge${hasRoom ? " lb-step-badge-done" : ""}`}>
                  {hasRoom ? "✓" : "1"}
                </div>
                <div>
                  <p className="lb-step-title">Create</p>
                  <p className="lb-step-desc">Name your class and room</p>
                </div>
              </div>
              <div className="lb-step-body">
                <div className="lb-field">
                  <label className="lb-label" htmlFor="lb-class-name">Class name</label>
                  <input
                    id="lb-class-name"
                    className="lb-inp"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="e.g. Physics 101"
                  />
                </div>
                <div className="lb-field">
                  <label className="lb-label" htmlFor="lb-room-name">Room name</label>
                  <input
                    id="lb-room-name"
                    className="lb-inp"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Wave Lab"
                  />
                </div>
                <button
                  className="lb-btn lb-btn-pri"
                  disabled={busy || authDisabled}
                  onClick={() => void createRoomOfType("classroom")}
                >
                  {busy ? "Creating…" : "Create room"}
                </button>
              </div>
            </div>

            <div className="lb-step-vsep" />

            {/* Step 2: Share */}
            <div className={`lb-step-col${hasRoom ? " lb-lit" : " lb-pending"}`} aria-live="polite">
              <div className="lb-step-hd">
                <div className={`lb-step-badge${!hasRoom ? " lb-step-badge-dim" : ""}`}>2</div>
                <div>
                  <p className="lb-step-title">Share</p>
                  <p className="lb-step-desc">Send the invite to students</p>
                </div>
              </div>
              <div className="lb-step-body">
                {hasRoom && createdInvite ? (
                  <>
                    <div className="lb-invite-code" aria-label="Invite code">
                      {createdInvite.code}
                    </div>
                    <div className="lb-btn-row">
                      <button
                        className="lb-btn lb-btn-pri lb-btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => void copyInvite("code")}
                      >
                        {copyStatus === "code" ? "✓ Copied!" : "Copy code"}
                      </button>
                      <button
                        className="lb-btn lb-btn-sec lb-btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => void copyInvite("link")}
                      >
                        {copyStatus === "link" ? "✓ Copied!" : "Copy link"}
                      </button>
                    </div>
                    <div className="lb-field">
                      <span className="lb-label">Join link</span>
                      <input
                        className="lb-inp"
                        readOnly
                        value={inviteJoinUrl(createdInvite.roomId!, createdInvite.code)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="lb-placeholder">Invite code appears here after step 1</div>
                )}
              </div>
            </div>

            <div className="lb-step-vsep" />

            {/* Step 3: Enter */}
            <div className={`lb-step-col${hasRoom ? " lb-lit" : " lb-pending"}`}>
              <div className="lb-step-hd">
                <div className={`lb-step-badge${!hasRoom ? " lb-step-badge-dim" : ""}`}>3</div>
                <div>
                  <p className="lb-step-title">Enter</p>
                  <p className="lb-step-desc">Open your room in 3D</p>
                </div>
              </div>
              <div className="lb-step-body">
                {hasRoom ? (
                  <>
                    <Link
                      className="lb-btn lb-btn-pri lb-btn-full"
                      href={`/rooms/${createdInvite!.roomId}`}
                    >
                      Enter room →
                    </Link>
                    <p className="lb-join-hint" style={{ textAlign: "center" }}>Room is live and ready</p>
                  </>
                ) : (
                  <div className="lb-placeholder">Enter room button appears here after step 1</div>
                )}
              </div>
            </div>

          </div>
        );

      case "workforce-training":
        return (
          <div className="lb-steps-grid">

            {/* Step 1: Create */}
            <div className="lb-step-col">
              <div className="lb-step-hd">
                <div className={`lb-step-badge${hasRoom ? " lb-step-badge-done" : ""}`}>
                  {hasRoom ? "✓" : "1"}
                </div>
                <div>
                  <p className="lb-step-title">Create</p>
                  <p className="lb-step-desc">Name your team and session</p>
                </div>
              </div>
              <div className="lb-step-body">
                <div className="lb-field">
                  <label className="lb-label" htmlFor="lb-team-name">Organization / Team name</label>
                  <input
                    id="lb-team-name"
                    className="lb-inp"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                    placeholder="e.g. Acme Field Ops"
                  />
                </div>
                <div className="lb-field">
                  <label className="lb-label" htmlFor="lb-session-name">Session name</label>
                  <input
                    id="lb-session-name"
                    className="lb-inp"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Compliance Refresher"
                  />
                </div>
                <button
                  className="lb-btn lb-btn-pri"
                  disabled={busy || authDisabled}
                  onClick={() => void createRoomOfType("workforce-training")}
                >
                  {busy ? "Creating…" : "Create training"}
                </button>
              </div>
            </div>

            <div className="lb-step-vsep" />

            {/* Step 2: Share */}
            <div className={`lb-step-col${hasRoom ? " lb-lit" : " lb-pending"}`} aria-live="polite">
              <div className="lb-step-hd">
                <div className={`lb-step-badge${!hasRoom ? " lb-step-badge-dim" : ""}`}>2</div>
                <div>
                  <p className="lb-step-title">Share</p>
                  <p className="lb-step-desc">Send the invite to trainees</p>
                </div>
              </div>
              <div className="lb-step-body">
                {hasRoom && createdInvite ? (
                  <>
                    <div className="lb-invite-code" aria-label="Invite code">
                      {createdInvite.code}
                    </div>
                    <div className="lb-btn-row">
                      <button
                        className="lb-btn lb-btn-pri lb-btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => void copyInvite("code")}
                      >
                        {copyStatus === "code" ? "✓ Copied!" : "Copy code"}
                      </button>
                      <button
                        className="lb-btn lb-btn-sec lb-btn-sm"
                        style={{ flex: 1 }}
                        onClick={() => void copyInvite("link")}
                      >
                        {copyStatus === "link" ? "✓ Copied!" : "Copy link"}
                      </button>
                    </div>
                    <div className="lb-field">
                      <span className="lb-label">Join link</span>
                      <input
                        className="lb-inp"
                        readOnly
                        value={inviteJoinUrl(createdInvite.roomId!, createdInvite.code)}
                      />
                    </div>
                  </>
                ) : (
                  <div className="lb-placeholder">Invite code appears here after step 1</div>
                )}
              </div>
            </div>

            <div className="lb-step-vsep" />

            {/* Step 3: Enter */}
            <div className={`lb-step-col${hasRoom ? " lb-lit" : " lb-pending"}`}>
              <div className="lb-step-hd">
                <div className={`lb-step-badge${!hasRoom ? " lb-step-badge-dim" : ""}`}>3</div>
                <div>
                  <p className="lb-step-title">Enter</p>
                  <p className="lb-step-desc">Open your training in 3D</p>
                </div>
              </div>
              <div className="lb-step-body">
                {hasRoom ? (
                  <>
                    <Link
                      className="lb-btn lb-btn-pri lb-btn-full"
                      href={`/rooms/${createdInvite!.roomId}`}
                    >
                      Enter training →
                    </Link>
                    <p className="lb-join-hint" style={{ textAlign: "center" }}>Training is live and ready</p>
                  </>
                ) : (
                  <div className="lb-placeholder">Enter training button appears here after step 1</div>
                )}
              </div>
            </div>

          </div>
        );

      case "free-for-all":
        return (
          <div className="lb-steps-grid">

            {/* Step 1: Create */}
            <div className="lb-step-col">
              <div className="lb-step-hd">
                <div className={`lb-step-badge${hasRoom ? " lb-step-badge-done" : ""}`}>
                  {hasRoom ? "✓" : "1"}
                </div>
                <div>
                  <p className="lb-step-title">Create</p>
                  <p className="lb-step-desc">Name your room</p>
                </div>
              </div>
              <div className="lb-step-body">
                <div className="lb-field">
                  <label className="lb-label" htmlFor="lb-ffa-room-name">Room name</label>
                  <input
                    id="lb-ffa-room-name"
                    className="lb-inp"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. Hangout"
                  />
                </div>
                <div className="lb-field">
                  <label className="lb-label" htmlFor="lb-ffa-create-password">Room password</label>
                  <input
                    id="lb-ffa-create-password"
                    className="lb-inp"
                    type="password"
                    autoComplete="current-password"
                    value={ffaPassword}
                    onChange={(e) => setFfaPassword(e.target.value)}
                    placeholder="Shared Free-for-All password"
                  />
                </div>
                <button
                  className="lb-btn lb-btn-pri"
                  disabled={busy || authDisabled || !ffaPassword.trim()}
                  onClick={() => void createRoomOfType("free-for-all")}
                >
                  {busy ? "Creating…" : "Create room"}
                </button>
              </div>
            </div>

            <div className="lb-step-vsep" />

            {/* Step 2: Enter */}
            <div className={`lb-step-col${hasRoom ? " lb-lit" : " lb-pending"}`}>
              <div className="lb-step-hd">
                <div className={`lb-step-badge${!hasRoom ? " lb-step-badge-dim" : ""}`}>2</div>
                <div>
                  <p className="lb-step-title">Enter</p>
                  <p className="lb-step-desc">Open your room</p>
                </div>
              </div>
              <div className="lb-step-body">
                {hasRoom ? (
                  <>
                    <Link
                      className="lb-btn lb-btn-pri lb-btn-full"
                      href={`/rooms/${createdInvite!.roomId}`}
                    >
                      Enter room →
                    </Link>
                    <p className="lb-join-hint" style={{ textAlign: "center" }}>Room is live and ready</p>
                  </>
                ) : (
                  <div className="lb-placeholder">Enter room button appears here after step 1</div>
                )}
              </div>
            </div>

          </div>
        );
    }
  }

  return (
    <>
      {/* ── Top nav ── */}
      <nav className="lb-nav">
        <div className="lb-nav-inner">
          <span className="lb-wordmark">3DSpace</span>
          <div className="lb-nav-fill" />
          <div className="lb-nav-status">
            <div className="lb-nav-dot" />
            <span>Ready</span>
          </div>
        </div>
      </nav>

      {/* ── Page ── */}
      <div className="lb-page">
        <div className="lb-inner">

          {/* ── Header ── */}
          <header className="lb-header">
            <h1 className="lb-title">Class, with <em>depth.</em></h1>
            <p className="lb-sub">Create a room, share the invite, and start in seconds.</p>
          </header>

          {/* ── Auth (Clerk only) ── */}
          {clerkEnabled && (
            <div className="lb-auth">
              <AuthGate />
            </div>
          )}

          {/* ── Teacher flow ── */}
          <div className="lb-panel" aria-label="Steps to host a room">

            {/* Room type selector */}
            <div className="lb-type-bar">
              <label className="lb-label" htmlFor="lb-room-type">Room type</label>
              <div className="lb-type-row">
                <select
                  id="lb-room-type"
                  className="lb-select"
                  value={roomType}
                  onChange={(e) => handleRoomTypeChange(e.target.value as RoomType)}
                >
                  {ROOM_TYPES
                    .filter((rt) => {
                      if (rt.value === "workforce-training") return CLIENT_TUNING.enableWorkforceTraining;
                      if (rt.value === "free-for-all") return CLIENT_TUNING.enableFreeForAll;
                      return true;
                    })
                    .map((rt) => (
                      <option key={rt.value} value={rt.value}>{rt.label}</option>
                    ))}
                </select>
                <span className="lb-type-desc">
                  {ROOM_TYPES.find((rt) => rt.value === roomType)?.description}
                </span>
              </div>
            </div>

            {/* Type-specific steps */}
            {renderRoomTypeSteps()}

          </div>

          {/* ── Student join ── */}
          <div className="lb-divider">
            <span className="lb-divider-pill">Joining as a {joinCopy.guestSingular}?</span>
          </div>
          <div className="lb-join-wrap">
            <div className="lb-panel">
              <div className="lb-join-body">
                {roomType === "free-for-all" ? (
                  <FreeForAllRoomBrowser
                    identity={identity}
                    busy={busy}
                    setBusy={setBusy}
                    setError={setError}
                    manageableClassIds={manageableClassIds}
                    password={ffaPassword}
                    onPasswordChange={setFfaPassword}
                    onRoomDeleted={refresh}
                  />
                ) : (
                  <>
                    <p className="lb-join-hint">
                      Paste the invite code your {joinCopy.hostSingular} shared, or open their join link directly.
                    </p>
                    <div className="lb-field">
                      <label className="lb-label lb-label-tx" htmlFor="lb-invite-code">Invite code</label>
                      <input
                        id="lb-invite-code"
                        className="lb-inp"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        placeholder="Paste code here"
                      />
                    </div>
                    <button
                      className="lb-btn lb-btn-pri"
                      disabled={busy || !inviteCode.trim() || authDisabled}
                      onClick={() => void joinInvite()}
                    >
                      {busy ? "Joining…" : joinCopy.joinButtonLabel}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ── Existing rooms ── */}
          {rooms.length > 0 && (
            <div className="lb-rooms-wrap">
              <div className="lb-rooms-lbl">Your rooms</div>
              {rooms.map((room) => (
                <div key={room.id} className="lb-room-item">
                  <div className="lb-room-pulse" />
                  <span className="lb-room-name">{room.name}</span>
                  <span className="lb-room-class">
                    {classes.find((c) => c.id === room.classId)?.name ?? room.classId}
                  </span>
                  <div className="lb-room-acts">
                    {canManageRoom(room) ? (
                      <CopyRoomInviteButton
                        identity={identity}
                        roomId={room.id}
                        className="lb-btn lb-btn-sec lb-btn-sm"
                        disabled={busy}
                      />
                    ) : null}
                    <Link className="lb-btn lb-btn-sec lb-btn-sm" href={`/rooms/${room.id}`}>
                      Open →
                    </Link>
                    {canManageRoom(room) && (CLIENT_TUNING.enableHallPass || CLIENT_TUNING.enableRoomObjects) ? (
                      <button
                        className="lb-btn lb-btn-sec lb-btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (settingsOpen === room.id) {
                            closeRoomSettings();
                          } else {
                            openRoomSettings(room);
                          }
                        }}
                      >
                        Settings
                      </button>
                    ) : null}
                    {canManageRoom(room) && (
                      <button
                        className="lb-btn lb-btn-dan lb-btn-sm"
                        disabled={busy}
                        onClick={() => void removeRoom(room)}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                  {settingsOpen === room.id && (draftHallpass || draftRoomObjects) ? (
                    <div className="lb-room-settings">
                      {CLIENT_TUNING.enableRoomObjects && draftRoomObjects ? (
                        <>
                          <p className="lb-label" style={{ marginBottom: 6 }}>3D manipulatives</p>
                          <label className="lb-settings-row">
                            <input
                              type="checkbox"
                              checked={draftRoomObjects.enabled}
                              onChange={(e) => setDraftRoomObjects({ ...draftRoomObjects, enabled: e.target.checked })}
                            />
                            <span className="lb-label">Enabled in this room</span>
                          </label>
                          <label className="lb-settings-row">
                            <input
                              type="checkbox"
                              checked={draftRoomObjects.customUploadsEnabled}
                              disabled={!draftRoomObjects.enabled}
                              onChange={(e) =>
                                setDraftRoomObjects({ ...draftRoomObjects, customUploadsEnabled: e.target.checked })
                              }
                            />
                            <span className="lb-label">Allow custom .glb uploads</span>
                          </label>
                        </>
                      ) : null}
                      {CLIENT_TUNING.enableHallPass && draftHallpass ? (
                        <>
                          <p className="lb-label" style={{ marginBottom: 6, marginTop: draftRoomObjects ? 12 : 0 }}>
                            Hall pass settings
                          </p>
                          <label className="lb-settings-row">
                            <input
                              type="checkbox"
                              checked={draftHallpass.enabled}
                              onChange={(e) => setDraftHallpass({ ...draftHallpass, enabled: e.target.checked })}
                            />
                            <span className="lb-label">Enabled</span>
                          </label>
                          <label className="lb-settings-row">
                            <span className="lb-label">Max concurrent</span>
                            <input
                              type="number"
                              className="lb-inp lb-inp-sm"
                              min={0}
                              max={10}
                              value={draftHallpass.maxConcurrent}
                              onChange={(e) => setDraftHallpass({ ...draftHallpass, maxConcurrent: Math.max(0, Math.min(10, Number(e.target.value))) })}
                            />
                          </label>
                          <label className="lb-settings-row">
                            <span className="lb-label">Per-period limit</span>
                            <input
                              type="number"
                              className="lb-inp lb-inp-sm"
                              min={0}
                              max={20}
                              value={draftHallpass.perPeriodLimit}
                              onChange={(e) => setDraftHallpass({ ...draftHallpass, perPeriodLimit: Math.max(0, Math.min(20, Number(e.target.value))) })}
                            />
                          </label>
                        </>
                      ) : null}
                      <div className="lb-btn-row" style={{ marginTop: 8 }}>
                        <button
                          className="lb-btn lb-btn-pri lb-btn-sm"
                          disabled={busy}
                          onClick={() => void saveRoomSettings(room.id)}
                        >
                          Save
                        </button>
                        <button
                          className="lb-btn lb-btn-sec lb-btn-sm"
                          onClick={closeRoomSettings}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}

          {/* ── Error ── */}
          {error && <div className="lb-alert">{error}</div>}

        </div>
      </div>
    </>
  );
}
