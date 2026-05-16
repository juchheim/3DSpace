"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ClassRecord, Invite, RoomRecord } from "@3dspace/contracts";
import { acceptInvite, createClass, createInvite, createRoom, listClasses, listRooms } from "../lib/api";
import { AuthGate } from "../lib/auth";
import { APP_URL } from "../lib/config";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";

export function Lobby() {
  const { identity, setIdentity, setRole, clerkEnabled, signedIn } = usePersistentIdentity();
  const [className, setClassName] = useState("Physics 101");
  const [roomName, setRoomName] = useState("Wave Lab");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
    void refresh();
  }, [identity.userId]);

  async function createClassroom() {
    setBusy(true);
    setError("");
    try {
      const classRecord = await createClass(identity, className);
      const room = await createRoom(identity, classRecord.id, roomName);
      const invite = await createInvite(identity, classRecord.id, { role: "student", roomId: room.room.id });
      setCreatedInvite(invite);
      await refresh();
      window.location.href = `/rooms/${room.room.id}`;
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
            <p className="small">Production identity is provided by Clerk. Class roles are enforced by backend memberships.</p>
          ) : (
            <div className="split">
              <label>
                Role
                <select value={identity.role} onChange={(event) => setRole(event.target.value as "teacher" | "student")}>
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
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
                      userId: identity.role === "teacher" ? "dev-teacher" : "dev-student"
                    })
                  }
                />
              </label>
            </div>
          )}

          {identity.role === "teacher" ? (
            <div className="stack">
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
            </div>
          ) : (
            <div className="stack">
              <label>
                Invite code
                <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="Paste code" />
              </label>
              <button disabled={busy || !inviteCode.trim() || (clerkEnabled && !signedIn)} onClick={joinInvite}>
                Join class room
              </button>
            </div>
          )}

          {createdInvite ? (
            <div className="status-pill">
              Invite: {createdInvite.code} · {APP_URL}/rooms/{createdInvite.roomId}?invite={createdInvite.code}
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
                    <Link className="button secondary" href={`/rooms/${room.id}`}>
                      Open room
                    </Link>
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
