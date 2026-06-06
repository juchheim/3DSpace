"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { ClassRecord, Invite, RoomRecord } from "@3dspace/contracts";
import { acceptInvite, createClass, createInvite, createRoom, deleteRoom, listClasses, listRooms } from "../lib/api";
import { AuthGate } from "../lib/auth";
import { inviteJoinUrl } from "../lib/invite";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";
import { CopyRoomInviteButton } from "./CopyRoomInviteButton";
import { VerseOrb } from "./VerseOrb";
import { VERSES, verseClassName, verseFromClassName, verseRoomType, verseThemeVars, type Verse } from "../lib/verses";

// Defaults used to decide whether to preserve a user's custom class/room text
// when they switch verses (mirrors the design's VERSE_DEFAULTS behavior).
const VERSE_DEFAULTS = new Set(VERSES.flatMap((v) => [v.defaultClass, v.defaultRoom]));

const LOGO_SRC = "/dream-ixr-logo1.png";

export function Lobby() {
  const { identity, loaded, authRequired, signedIn } = usePersistentIdentity();

  const [selectedVerseId, setSelectedVerseId] = useState<string | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [className, setClassName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [createdInvite, setCreatedInvite] = useState<Invite | null>(null);
  const [createdVerseId, setCreatedVerseId] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [copyStatus, setCopyStatus] = useState<"code" | "link" | null>(null);
  const [createBusy, setCreateBusy] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [rooms, setRooms] = useState<RoomRecord[]>([]);

  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedVerse = selectedVerseId ? VERSES.find((v) => v.id === selectedVerseId) ?? null : null;
  const hasRoom = Boolean(createdInvite?.roomId);
  const authDisabled = authRequired && !signedIn;

  // Rooms that belong to a verse (created from this lobby), with their verse resolved.
  const verseRooms = rooms
    .map((room) => {
      const cls = classes.find((c) => c.id === room.classId);
      const verse = verseFromClassName(cls?.name);
      return verse ? { room, verse } : null;
    })
    .filter((entry): entry is { room: RoomRecord; verse: Verse } => entry !== null);

  useEffect(() => {
    document.documentElement.classList.add("dixr-dark");
    document.body.classList.add("dixr-dark");
    return () => {
      document.documentElement.classList.remove("dixr-dark");
      document.body.classList.remove("dixr-dark");
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
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
    if (authRequired && !signedIn) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.userId, loaded, authRequired, signedIn]);

  function scrollToEl(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 56;
    window.scrollTo({ top: y, behavior: "smooth" });
  }

  function openAccess() {
    setAccessOpen(true);
    requestAnimationFrame(() => scrollToEl("access"));
  }

  // Click a verse card: select it, prefill the create form, open + scroll to access.
  function enterVerse(verse: Verse) {
    setSelectedVerseId(verse.id);
    setClassName(verse.defaultClass);
    setRoomName(verse.defaultRoom);
    setCreatedInvite(null);
    setCreatedVerseId(null);
    setCopyStatus(null);
    setError("");
    setAccessOpen(true);
    requestAnimationFrame(() => scrollToEl("access"));
  }

  // Verse chosen from the dropdown inside the Create step (preserve custom text).
  function selectVerseFromForm(verse: Verse) {
    setSelectedVerseId(verse.id);
    setClassName((prev) => (!prev.trim() || VERSE_DEFAULTS.has(prev) ? verse.defaultClass : prev));
    setRoomName((prev) => (!prev.trim() || VERSE_DEFAULTS.has(prev) ? verse.defaultRoom : prev));
    setError("");
  }

  function clearVerse() {
    setSelectedVerseId(null);
    setCreatedInvite(null);
    setCreatedVerseId(null);
    setError("");
  }

  // Ensure the verse's backing class exists (one per verse, owned by this user).
  async function ensureVerseClass(verse: Verse): Promise<string> {
    const wanted = verseClassName(verse);
    const existing = classes.find((c) => c.name === wanted && c.teacherUserId === identity.userId);
    if (existing) return existing.id;
    const created = await createClass(identity, wanted);
    return created.id;
  }

  async function doCreateRoom() {
    if (!selectedVerse || createBusy) return;
    setCreateBusy(true);
    setError("");
    try {
      const classId = await ensureVerseClass(selectedVerse);
      const created = await createRoom(
        identity,
        classId,
        roomName.trim() || selectedVerse.defaultRoom,
        verseRoomType(selectedVerse)
      );
      const invite = await createInvite(identity, classId, { role: "student", roomId: created.room.id });
      setCreatedInvite(invite);
      setCreatedVerseId(selectedVerse.id);
      setCopyStatus(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create room.");
    } finally {
      setCreateBusy(false);
    }
  }

  async function copyInvite(target: "code" | "link") {
    if (!createdInvite?.roomId) return;
    const text = target === "code" ? createdInvite.code : inviteJoinUrl(createdInvite.roomId, createdInvite.code);
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(target);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyStatus(null), 2_000);
    } catch {
      setError("Unable to copy to clipboard. Select the text and copy manually.");
    }
  }

  async function doJoin() {
    if (!inviteInput.trim() || joinBusy) return;
    setJoinBusy(true);
    setError("");
    try {
      const accepted = await acceptInvite(identity, inviteInput.trim());
      if (!accepted.roomId) throw new Error("Invite was accepted, but no room was attached.");
      window.location.href = `/rooms/${accepted.roomId}?invite=${encodeURIComponent(inviteInput.trim())}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to join with that code.");
      setJoinBusy(false);
    }
  }

  async function doDeleteRoom(roomId: string) {
    if (!window.confirm("Delete this room? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      await deleteRoom(identity, roomId);
      if (createdInvite?.roomId === roomId) {
        setCreatedInvite(null);
        setCreatedVerseId(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete room.");
    } finally {
      setBusy(false);
    }
  }

  const accessStyle = selectedVerse ? (verseThemeVars(selectedVerse.hue) as CSSProperties) : undefined;
  const accessCta = accessOpen
    ? "Hide room panel"
    : selectedVerse
      ? `Create a room in ${selectedVerse.name} IXR`
      : "Create or join a room";
  const enterHref = createdInvite?.roomId
    ? `/rooms/${createdInvite.roomId}${createdVerseId ? `?verse=${createdVerseId}` : ""}`
    : "#";

  return (
    <div className="dixr">
      {/* ── Top nav ── */}
      <nav className="site-nav">
        <div className="nav-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="nav-logo"><img src={LOGO_SRC} alt="Dream IXR" /></span>
          <div className="nav-fill" />
          <Link className="nav-legacy" href="/legacy">Legacy rooms</Link>
          <div className="nav-sep" />
          <div className="nav-status">
            <div className="nav-dot" />
            <span>Ready</span>
          </div>
        </div>
      </nav>

      {/* ── Page ── */}
      <div className="page">
        <div className="inner">

          {/* ── Header ── */}
          <header className="header-block">
            <div className="header-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOGO_SRC} alt="Dream IXR" />
            </div>
            <h1 className="site-title">Immersive <em>X</em> Reality.</h1>
            <p className="site-sub">A browser-based immersive platform where learners, creators, and communities meet to experience, explore, and build real skills together.</p>
            <div className="hero-ctas">
              <button className="btn pri glow lg" onClick={openAccess}>Enter a space →</button>
              <button className="btn ghost lg" onClick={() => scrollToEl("verses")}>Explore the Verses</button>
            </div>
          </header>

          {/* ── X band ── */}
          <section className="xband">
            <p className="xband-lead">The <em>X</em> is the point.</p>
            <div className="x-words">
              {["Experience", "Exploration", "Exchange", "Expression", "Expansion", "Execution", "Excellence"].map((w) => (
                <span key={w} className="x-word">E<span className="xh">x</span>{w.slice(2)}</span>
              ))}
            </div>
            <p className="xband-note">Immersive X Reality is built for education, digital skills training, cultural exchange, workforce development, and creative collaboration — with the ease of the browser and the depth of a real world.</p>
          </section>

          {/* ── Verses ── */}
          <section id="verses">
            <div className="sec-head">
              <span className="sec-label">Themed worlds</span>
              <h2 className="sec-title">One platform, many <em>Verses</em>.</h2>
              <p className="sec-intro">Every Verse is its own immersive world inside Dream IXR — purpose-built for a discipline, powered by the same IXR engine.</p>
            </div>
            <div className="verse-grid">
              {VERSES.map((v) => (
                <div
                  key={v.id}
                  className="verse-card"
                  style={{ "--vh": `oklch(0.72 0.16 ${v.hue})` } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  onClick={() => enterVerse(v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      enterVerse(v);
                    }
                  }}
                >
                  <div className="verse-orb"><VerseOrb galaxy={v.galaxy} hue={v.hue} /></div>
                  <div className="verse-name">{v.name} <span>IXR</span></div>
                  <div className="verse-tag">{v.tag}</div>
                  <p className="verse-desc">{v.desc}</p>
                  <span className="verse-go">Create a room →</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Capabilities ── */}
          <section id="capabilities">
            <div className="sec-head">
              <span className="sec-label">The toolkit</span>
              <h2 className="sec-title">Everything a room needs.</h2>
              <p className="sec-intro">Access and collaboration expanded with the learning tools education actually depends on.</p>
            </div>
            <div className="cap-grid">
              <div className="cap-col">
                <h4>Spaces &amp; worlds</h4>
                <ul className="cap-list">
                  <li>Virtual rooms &amp; worlds</li>
                  <li>Classrooms, labs &amp; studios</li>
                  <li>Presentation &amp; showcase spaces</li>
                  <li>Breakout rooms</li>
                  <li>Public &amp; private access</li>
                  <li>3D model placement</li>
                </ul>
              </div>
              <div className="cap-col">
                <h4>Collaboration</h4>
                <ul className="cap-list">
                  <li>Personal avatars</li>
                  <li>Live meetings &amp; events</li>
                  <li>Screen sharing</li>
                  <li>Video, audio &amp; chat</li>
                  <li>Whiteboards</li>
                  <li>File &amp; media sharing</li>
                </ul>
              </div>
              <div className="cap-col">
                <h4>Learning</h4>
                <ul className="cap-list">
                  <li>AI-guided learning tools</li>
                  <li>Instructor dashboards</li>
                  <li>Student progress tracking</li>
                  <li>Badges &amp; certificates</li>
                  <li>Portfolio building</li>
                  <li>Competitions &amp; challenges</li>
                </ul>
              </div>
            </div>
          </section>

          {/* ── Education focus ── */}
          <section id="education">
            <div className="sec-head">
              <span className="sec-label">Built for learning</span>
              <h2 className="sec-title">Made for the classroom, <em>not just the meeting</em>.</h2>
              <p className="sec-intro">Dream IXR is designed around real programs and outcomes. A few of the spaces it powers:</p>
            </div>
            <div className="edu-chips">
              {[
                "Online summer camps", "WebXR classes", "Digital literacy training", "AI learning labs",
                "3D modeling projects", "Cultural studies rooms", "Foreign language exchange", "Culinary art showcases",
                "Creative media studios", "Workforce simulations", "Virtual career fairs", "Student exhibitions",
                "Competitions & paid challenges"
              ].map((chip) => (
                <span key={chip} className="edu-chip">{chip}</span>
              ))}
            </div>
          </section>

          {/* ── Building blocks ── */}
          <section id="blocks">
            <div className="sec-head">
              <span className="sec-label">The naming model</span>
              <h2 className="sec-title">Four ways to build a space.</h2>
              <p className="sec-intro">Inside every Verse, spaces are assembled from a simple, repeatable vocabulary.</p>
            </div>
            <div className="blocks">
              {[
                { name: "Academy", def: "Structured courses and guided curriculum." },
                { name: "Lab", def: "Hands-on experiments and builds." },
                { name: "Studio", def: "Creative production spaces." },
                { name: "Exchange", def: "Cultural and global collaboration." }
              ].map((b) => (
                <div key={b.name} className="block-card">
                  <div className="block-name">{b.name}</div>
                  <p className="block-def">{b.def}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Access disclosure ── */}
          <section id="access" className={`dixr-access${selectedVerse ? " themed" : ""}`} style={accessStyle}>
            <div className="sec-head">
              <span className="sec-label">Step inside</span>
              <h2 className="sec-title">Your space is one click away.</h2>
              <p className="sec-intro">Spin up an immersive classroom, lab, or studio in seconds — or jump into a room with a code your instructor shared.</p>
            </div>
            <button
              className={`access-trigger${accessOpen ? " open" : ""}`}
              onClick={() => setAccessOpen((o) => !o)}
            >
              <span className="access-cta">{accessCta}</span>
              <span className="access-chev">▾</span>
            </button>

            {accessOpen ? (
              <div className="access-region open">
                {/* Auth (Google) */}
                {authRequired ? <div className="dixr-auth"><AuthGate /></div> : null}

                {/* Selected verse banner */}
                {selectedVerse ? (
                  <div className="verse-banner show">
                    <div className="vb-orb" />
                    <div className="vb-text">
                      <span className="vb-kicker">Creating a room in</span>
                      <span className="vb-name"><b>{selectedVerse.name}</b> IXR</span>
                    </div>
                    <button className="vb-clear" onClick={clearVerse}>✕ Change verse</button>
                  </div>
                ) : null}

                {/* 3-step create flow */}
                <div className="panel">
                  <div className="steps-grid">

                    {/* Step 1: Create */}
                    <div className="step-col">
                      <div className="step-hd">
                        <div className={`step-badge${hasRoom ? " done" : ""}`}>{hasRoom ? "✓" : "1"}</div>
                        <div>
                          <div className="step-info-title">Create</div>
                          <div className="step-info-desc">Name your class and room</div>
                        </div>
                      </div>
                      <div className="step-body">
                        <div className="field">
                          <span className="fl">Verse</span>
                          <div className="vsel-wrap">
                            <span className="vsel-dot" />
                            <select
                              className="vsel"
                              value={selectedVerseId ?? ""}
                              onChange={(e) => {
                                const v = VERSES.find((x) => x.id === e.target.value);
                                if (v) selectVerseFromForm(v);
                              }}
                            >
                              <option value="" disabled>Select a Verse…</option>
                              {VERSES.map((v) => (
                                <option key={v.id} value={v.id}>{v.name} IXR</option>
                              ))}
                            </select>
                            <span className="vsel-chev">▼</span>
                          </div>
                        </div>
                        <div className="field">
                          <span className="fl">Class name</span>
                          <input
                            className="inp"
                            value={className}
                            onChange={(e) => setClassName(e.target.value)}
                            placeholder="e.g. Digital Skills 101"
                          />
                        </div>
                        <div className="field">
                          <span className="fl">Room name</span>
                          <input
                            className="inp"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            placeholder="e.g. WebXR Lab"
                          />
                        </div>
                        <button
                          className="btn pri"
                          onClick={() => void doCreateRoom()}
                          disabled={createBusy || !selectedVerse || authDisabled}
                        >
                          {createBusy ? "Creating…" : !selectedVerse ? "Select a Verse first" : "Create room"}
                        </button>
                      </div>
                    </div>

                    <div className="step-vsep" />

                    {/* Step 2: Share */}
                    <div className={`step-col${hasRoom ? " lit" : " pending"}`} aria-live="polite">
                      <div className="step-hd">
                        <div className={`step-badge${hasRoom ? "" : " dim"}`}>2</div>
                        <div>
                          <div className="step-info-title">Share</div>
                          <div className="step-info-desc">Send the invite to students</div>
                        </div>
                      </div>
                      <div className="step-body">
                        {hasRoom && createdInvite ? (
                          <>
                            <div className="invite-code-box">{createdInvite.code}</div>
                            <div className="btn-row">
                              <button className="btn pri sm" style={{ flex: 1 }} onClick={() => void copyInvite("code")}>
                                {copyStatus === "code" ? "✓ Copied!" : "Copy code"}
                              </button>
                              <button className="btn sec sm" style={{ flex: 1 }} onClick={() => void copyInvite("link")}>
                                {copyStatus === "link" ? "✓ Copied!" : "Copy link"}
                              </button>
                            </div>
                            <div className="field">
                              <span className="fl">Join link</span>
                              <input className="inp" readOnly value={inviteJoinUrl(createdInvite.roomId!, createdInvite.code)} />
                            </div>
                          </>
                        ) : (
                          <div className="step-placeholder">Invite code appears here after step 1</div>
                        )}
                      </div>
                    </div>

                    <div className="step-vsep" />

                    {/* Step 3: Enter */}
                    <div className={`step-col${hasRoom ? " lit" : " pending"}`}>
                      <div className="step-hd">
                        <div className={`step-badge${hasRoom ? "" : " dim"}`}>3</div>
                        <div>
                          <div className="step-info-title">Enter</div>
                          <div className="step-info-desc">Open your room in 3D</div>
                        </div>
                      </div>
                      <div className="step-body">
                        {hasRoom ? (
                          <>
                            <Link className="btn pri full" href={enterHref}>Enter room →</Link>
                            <span className="join-hint" style={{ textAlign: "center" }}>Room is live and ready</span>
                          </>
                        ) : (
                          <div className="step-placeholder">Enter room button appears here after step 1</div>
                        )}
                      </div>
                    </div>

                  </div>
                </div>

                {/* Student join */}
                <div className="divider"><span>Joining as a student?</span></div>
                <div className="join-wrap">
                  <div className="panel">
                    <div className="join-body">
                      <p className="join-hint">Paste the invite code your teacher shared, or open their join link directly.</p>
                      <div className="field">
                        <span className="fl" style={{ color: "var(--tx)" }}>Invite code</span>
                        <input
                          className="inp"
                          aria-label="Invite code"
                          value={inviteInput}
                          placeholder="Paste code here"
                          onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                        />
                      </div>
                      <button
                        className="btn pri"
                        onClick={() => void doJoin()}
                        disabled={joinBusy || !inviteInput.trim() || authDisabled}
                      >
                        {joinBusy ? "Joining…" : "Join class room"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Your verse rooms */}
                {verseRooms.length > 0 ? (
                  <div className="rooms-wrap">
                    <div className="rooms-lbl">Your rooms</div>
                    {verseRooms.map(({ room, verse }) => (
                      <div key={room.id} className="room-item" style={{ "--vh": `oklch(0.72 0.16 ${verse.hue})` } as CSSProperties}>
                        <div className="room-pulse" />
                        <span className="room-name-tx">{room.name}</span>
                        <span className="room-class-tx">{verse.name} IXR</span>
                        <div className="room-acts">
                          <CopyRoomInviteButton
                            identity={identity}
                            roomId={room.id}
                            className="btn sm sec"
                            disabled={busy}
                          />
                          <Link className="btn sm sec" href={`/rooms/${room.id}?verse=${verse.id}`}>Open →</Link>
                          <button className="btn sm dan" disabled={busy} onClick={() => void doDeleteRoom(room.id)}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {error ? <div className="alert-bar show">{error}</div> : null}
              </div>
            ) : null}
          </section>

          {/* ── Footer ── */}
          <footer className="site-footer">
            <div className="footer-mark">Dream <span>IXR</span></div>
            <div className="footer-note">Immersive X Reality — experience · explore · exchange · expand · execute</div>
          </footer>

        </div>
      </div>
    </div>
  );
}
