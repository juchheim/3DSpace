"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClassRecord, Invite, RoomRecord } from "@3dspace/contracts";
import { acceptInvite, createClass, createInvite, createRoom, deleteRoom, listClasses, listRooms } from "../lib/api";
import { AuthGate } from "../lib/auth";
import { APP_URL } from "../lib/config";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";

function inviteJoinUrl(roomId: string, code: string) {
  return `${APP_URL}/rooms/${roomId}?invite=${encodeURIComponent(code)}`;
}

export function Lobby() {
  const { identity, setIdentity, setRole, loaded, clerkEnabled, signedIn } = usePersistentIdentity();
  const [className, setClassName] = useState("Physics 101");
  const [roomName, setRoomName] = useState("Wave Lab");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<"code" | "link" | null>(null);

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

  return (
    <main className="app-shell home-shell">

      {/* ── Header ── */}
      <header className="home-header">
        <span className="eyebrow">3DSpace</span>
        <h1 className="home-title">Class, with depth.</h1>
        <p className="home-sub">Create a room, share the invite, and start in seconds.</p>
      </header>

      {/* ── Auth / dev identity ── */}
      <div className="home-auth">
        <AuthGate />
        {!clerkEnabled && (
          <div className="dev-bar">
            <label>
              Role
              <select
                value={identity.userId}
                onChange={(event) => setRole(event.target.value === "dev-teacher" ? "teacher" : "student")}
              >
                <option value="dev-teacher">Teacher (dev)</option>
                <option value="dev-student">Student (dev)</option>
              </select>
            </label>
            <label>
              Display name
              <input
                value={identity.displayName}
                onChange={(event) =>
                  setIdentity({ role: identity.role, displayName: event.target.value, userId: identity.userId })
                }
              />
            </label>
          </div>
        )}
      </div>

      {/* ── 3-step teacher flow ── */}
      <div className="steps-row" aria-label="Steps to host a class">

        {/* Step 1 — Create */}
        <div className="step-card">
          <div className="step-header">
            <span className="step-num">1</span>
            <div>
              <h2 className="step-title">Create</h2>
              <p className="step-desc">Name your class and room</p>
            </div>
          </div>
          <label>
            Class name
            <input value={className} onChange={(event) => setClassName(event.target.value)} />
          </label>
          <label>
            Room name
            <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
          </label>
          <button disabled={busy || (clerkEnabled && !signedIn)} onClick={createClassroom}>
            {busy ? "Creating…" : "Create room"}
          </button>
        </div>

        <div className="step-arrow" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 14h16M16 8l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Step 2 — Share */}
        <div className={`step-card${hasRoom ? " step-lit" : " step-pending"}`} aria-live="polite">
          <div className="step-header">
            <span className={`step-num${hasRoom ? "" : " step-num-dim"}`}>2</span>
            <div>
              <h2 className="step-title">Share</h2>
              <p className="step-desc">Send the invite to students</p>
            </div>
          </div>
          {hasRoom && createdInvite ? (
            <>
              <p className="invite-code" aria-label="Invite code">{createdInvite.code}</p>
              <button type="button" onClick={() => void copyInvite("code")}>
                {copyStatus === "code" ? "Copied!" : "Copy code only"}
              </button>
              <button type="button" className="secondary" onClick={() => void copyInvite("link")}>
                {copyStatus === "link" ? "Copied!" : "Copy invite link"}
              </button>
              <label>
                Join link
                <input readOnly value={inviteJoinUrl(createdInvite.roomId!, createdInvite.code)} />
              </label>
            </>
          ) : (
            <div className="step-placeholder">Invite code appears here after step 1</div>
          )}
        </div>

        <div className="step-arrow" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <path d="M6 14h16M16 8l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Step 3 — Enter */}
        <div className={`step-card${hasRoom ? " step-lit" : " step-pending"}`}>
          <div className="step-header">
            <span className={`step-num${hasRoom ? "" : " step-num-dim"}`}>3</span>
            <div>
              <h2 className="step-title">Enter</h2>
              <p className="step-desc">Open your room in 3D</p>
            </div>
          </div>
          {hasRoom ? (
            <Link className="button step-enter-btn" href={`/rooms/${createdInvite!.roomId}`}>
              Enter room
            </Link>
          ) : (
            <div className="step-placeholder">Enter room button appears here</div>
          )}
        </div>
      </div>

      {/* ── Student join ── */}
      <div className="join-section">
        <div className="join-rule"><span>Joining as a student?</span></div>
        <div className="join-panel panel stack">
          <p className="small">Paste the invite code from your teacher, or open the join link they shared.</p>
          <label>
            Invite code
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="Paste code here"
            />
          </label>
          <button disabled={busy || !inviteCode.trim() || (clerkEnabled && !signedIn)} onClick={joinInvite}>
            Join class room
          </button>
        </div>
      </div>

      {/* ── Existing rooms ── */}
      {rooms.length > 0 && (
        <div className="rooms-section stack">
          <strong>Your rooms</strong>
          <ul className="roster-list">
            {rooms.map((room) => (
              <li key={room.id} className="roster-item">
                <span>{room.name}</span>
                <span className="small">
                  {classes.find((c) => c.id === room.classId)?.name ?? room.classId}
                </span>
                <div className="cluster">
                  <Link className="button secondary" href={`/rooms/${room.id}`}>
                    Open room
                  </Link>
                  {canManageRoom(room) && (
                    <button type="button" className="ghost" disabled={busy} onClick={() => void removeRoom(room)}>
                      Delete
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error ? <div className="alert">{error}</div> : null}
    </main>
  );
}
