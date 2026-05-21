"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClassRecord, Invite, RoomRecord, RoomSettings } from "@3dspace/contracts";
import { acceptInvite, createClass, createInvite, createRoom, deleteRoom, listClasses, listRooms, patchRoom } from "../lib/api";
import { AuthGate } from "../lib/auth";
import { CLIENT_TUNING } from "../lib/config";
import { inviteJoinUrl } from "../lib/invite";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";
import { CopyRoomInviteButton } from "./CopyRoomInviteButton";

export function Lobby() {
  const { identity, loaded, clerkEnabled, signedIn } = usePersistentIdentity();
  const [className, setClassName] = useState("Physics 101");
  const [roomName, setRoomName] = useState("Wave Lab");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"code" | "link" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState<string | null>(null);
  const [draftHallpass, setDraftHallpass] = useState<RoomSettings["hallpass"] | null>(null);

  useEffect(() => {
    document.body.classList.add("lobby-dark");
    return () => { document.body.classList.remove("lobby-dark"); };
  }, []);

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

  async function createClassroom() {
    setBusy(true);
    setError("");
    try {
      const classRecord = await createClass(identity, className);
      const room = await createRoom(identity, classRecord.id, roomName);
      const invite = await createInvite(identity, classRecord.id, { role: "student", roomId: room.room.id });
      setCreatedInvite(invite);
      setCopyStatus(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create classroom.");
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

  async function saveHallpassSettings(roomId: string) {
    if (!draftHallpass) return;
    setBusy(true);
    setError("");
    try {
      await patchRoom(identity, roomId, { settings: { hallpass: draftHallpass } });
      await refresh();
      setSettingsOpen(null);
      setDraftHallpass(null);
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

          {/* ── 3-step teacher flow ── */}
          <div className="lb-panel" aria-label="Steps to host a class">
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
                    onClick={() => void createClassroom()}
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
          </div>

          {/* ── Student join ── */}
          <div className="lb-divider">
            <span className="lb-divider-pill">Joining as a student?</span>
          </div>
          <div className="lb-join-wrap">
            <div className="lb-panel">
              <div className="lb-join-body">
                <p className="lb-join-hint">
                  Paste the invite code your teacher shared, or open their join link directly.
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
                  {busy ? "Joining…" : "Join class room"}
                </button>
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
                    {canManageRoom(room) && CLIENT_TUNING.enableHallPass ? (
                      <button
                        className="lb-btn lb-btn-sec lb-btn-sm"
                        disabled={busy}
                        onClick={() => {
                          if (settingsOpen === room.id) {
                            setSettingsOpen(null);
                            setDraftHallpass(null);
                          } else {
                            setSettingsOpen(room.id);
                            setDraftHallpass(room.settings.hallpass);
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
                  {settingsOpen === room.id && draftHallpass ? (
                    <div className="lb-room-settings">
                      <p className="lb-label" style={{ marginBottom: 6 }}>Hall pass settings</p>
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
                      <div className="lb-btn-row" style={{ marginTop: 8 }}>
                        <button
                          className="lb-btn lb-btn-pri lb-btn-sm"
                          disabled={busy}
                          onClick={() => void saveHallpassSettings(room.id)}
                        >
                          Save
                        </button>
                        <button
                          className="lb-btn lb-btn-sec lb-btn-sm"
                          onClick={() => { setSettingsOpen(null); setDraftHallpass(null); }}
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
