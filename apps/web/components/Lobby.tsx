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

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">3DSpace MVP</p>
          <h1>Class, with depth.</h1>
          <p className="hero-copy">
            Create a lightweight browser room, invite students, move together in 3D, switch to a full 2D analog, and keep
            media, audio, and wall anchors ready for the next learning tools.
          </p>
          <div className="cluster" aria-label="MVP capabilities">
            <span className="status-pill"><span className="status-dot" />3D room</span>
            <span className="status-pill"><span className="status-dot" />2D analog</span>
            <span className="status-pill"><span className="status-dot" />LiveKit-ready</span>
            <span className="status-pill"><span className="status-dot" />Wall anchors</span>
          </div>
        </div>

        <div className="panel stack" aria-label="Create or join a classroom">
          <AuthGate />

          {clerkEnabled ? (
            <p className="small">
              Sign in with Clerk to host or join. Students get the <strong>student</strong> role automatically when they use an
              invite code or join link — there is no separate role picker in production.
            </p>
          ) : (
            <div className="split">
              <label>
                Local test user
                <select value={identity.userId} onChange={(event) => setRole(event.target.value === "dev-teacher" ? "teacher" : "student")}>
                  <option value="dev-teacher">Teacher (dev-teacher)</option>
                  <option value="dev-student">Student (dev-student)</option>
                </select>
              </label>
              <label>
                Display name
                <input
                  value={identity.displayName}
                  onChange={(event) =>
                    setIdentity({
                      role: identity.role,
                      displayName: event.target.value,
                      userId: identity.userId
                    })
                  }
                />
              </label>
            </div>
          )}

          <section className="stack" aria-label="Host a class">
            <h2 className="lobby-section-title">Host a class</h2>
            <p className="small">Create a room and share the invite with students.</p>
            <label>
              Class name
              <input value={className} onChange={(event) => setClassName(event.target.value)} />
            </label>
            <label>
              Room name
              <input value={roomName} onChange={(event) => setRoomName(event.target.value)} />
            </label>
            <button disabled={busy || (clerkEnabled && !signedIn)} onClick={createClassroom}>
              Create room and invite
            </button>
          </section>

          <section className="stack" aria-label="Join as student">
            <h2 className="lobby-section-title">Join as student</h2>
            <p className="small">Paste the invite code from your teacher, or open their join link directly.</p>
            <label>
              Invite code
              <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="Paste code" />
            </label>
            <button disabled={busy || !inviteCode.trim() || (clerkEnabled && !signedIn)} onClick={joinInvite}>
              Join class room
            </button>
          </section>

          {createdInvite?.roomId ? (
            <div className="invite-panel stack" aria-live="polite">
              <strong>Room created — share this invite</strong>
              <p className="small">
                Students can paste the code under &ldquo;Join as student&rdquo; or open the join link in another browser.
              </p>
              <p className="invite-code" aria-label="Invite code">
                {createdInvite.code}
              </p>
              <div className="cluster">
                <button type="button" className="secondary" onClick={() => void copyInvite("code")}>
                  {copyStatus === "code" ? "Code copied" : "Copy code"}
                </button>
                <button type="button" className="secondary" onClick={() => void copyInvite("link")}>
                  {copyStatus === "link" ? "Link copied" : "Copy join link"}
                </button>
              </div>
              <label>
                Join link
                <input readOnly value={inviteJoinUrl(createdInvite.roomId, createdInvite.code)} />
              </label>
              <Link className="button" href={`/rooms/${createdInvite.roomId}`}>
                Enter room
              </Link>
            </div>
          ) : null}

          {rooms.length > 0 ? (
            <div className="stack">
              <strong>Available rooms</strong>
              <ul className="roster-list">
                {rooms.map((room) => (
                  <li key={room.id} className="roster-item">
                    <span>{room.name}</span>
                    <span className="small">{classes.find((classRecord) => classRecord.id === room.classId)?.name ?? room.classId}</span>
                    <div className="cluster">
                      <Link className="button secondary" href={`/rooms/${room.id}`}>
                        Open room
                      </Link>
                      {canManageRoom(room) ? (
                        <button type="button" className="ghost" disabled={busy} onClick={() => void removeRoom(room)}>
                          Delete
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? <div className="alert">{error}</div> : null}
          <p className="small">
            Local mode uses development identities and multi-tab realtime fallback. Deployed production uses Clerk, MongoDB,
            LiveKit, and object storage variables configured on Vercel/Koyeb.
          </p>
        </div>
      </section>
    </main>
  );
}
