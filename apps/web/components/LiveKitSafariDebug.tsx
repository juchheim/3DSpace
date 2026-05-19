"use client";

import { useMemo, useState } from "react";
import { joinRoom } from "../lib/api";
import { AuthGate } from "../lib/auth";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";

type LiveKitSafariDebugProps = {
  roomId: string;
  inviteCode?: string;
};

type SessionSummary = {
  roomId: string;
  livekitUrl: string;
  participantId: string;
  participantIdentity: string;
  role: string;
  tokenPreview: string;
  token: Record<string, unknown>;
};

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/CriOS\//.test(ua) && !/FxiOS\//.test(ua);
}

function maskToken(token: string) {
  if (token.length <= 16) return `${token.slice(0, 4)}...${token.slice(-4)}`;
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

function decodeBase64UrlJson(segment: string) {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function summarizeToken(token: string) {
  const [headerSegment, payloadSegment] = token.split(".");
  const header = headerSegment ? decodeBase64UrlJson(headerSegment) : undefined;
  const payload = payloadSegment ? decodeBase64UrlJson(payloadSegment) : undefined;
  return {
    kind: header && payload ? "jwt" : "decode-failed",
    header: header
      ? {
          alg: typeof header.alg === "string" ? header.alg : undefined,
          typ: typeof header.typ === "string" ? header.typ : undefined
        }
      : undefined,
    payload: payload
      ? {
          iss: typeof payload.iss === "string" ? payload.iss : undefined,
          sub: typeof payload.sub === "string" ? payload.sub : undefined,
          name: typeof payload.name === "string" ? payload.name : undefined,
          metadata: typeof payload.metadata === "string" ? payload.metadata : undefined,
          exp: typeof payload.exp === "number" ? payload.exp : undefined,
          nbf: typeof payload.nbf === "number" ? payload.nbf : undefined,
          video: typeof payload.video === "object" && payload.video ? payload.video : undefined
        }
      : undefined
  };
}

function summarizeIceServers(iceServers: RTCIceServer[] | undefined) {
  return (iceServers ?? []).map((server) => ({
    urls: Array.isArray(server.urls) ? server.urls : [server.urls],
    username: server.username ? "present" : undefined,
    credential: server.credential ? "present" : undefined
  }));
}

function summarizeCandidate(candidateLine: string) {
  const protocol = /\s(udp|tcp)\s/i.exec(candidateLine)?.[1]?.toLowerCase();
  const candidateType = /\styp\s([a-z0-9]+)/i.exec(candidateLine)?.[1]?.toLowerCase();
  const address = /candidate:\S+\s\d+\s(?:udp|tcp)\s\d+\s([^\s]+)\s(\d+)/i.exec(candidateLine);
  return {
    protocol,
    candidateType,
    address: address?.[1],
    port: address?.[2] ? Number(address[2]) : undefined
  };
}

async function warmSafariPermissions(
  appendLog: (label: string, value: unknown) => void,
  appendWarn: (label: string, value: unknown) => void
) {
  if (!isSafariBrowser() || !navigator.mediaDevices?.getUserMedia) return;

  const attempts: Array<{ kind: "audio" | "video"; constraints: MediaStreamConstraints }> = [
    { kind: "audio", constraints: { audio: true, video: false } },
    { kind: "video", constraints: { audio: false, video: true } }
  ];

  for (const attempt of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
      stream.getTracks().forEach((track) => track.stop());
      appendLog("[Safari permission warmup]", { result: "granted", kind: attempt.kind });
      return;
    } catch (error) {
      appendWarn("[Safari permission warmup]", {
        result: "failed",
        kind: attempt.kind,
        error: error instanceof Error ? error.name : "unknown"
      });
    }
  }
}

function installRtcProbe(
  appendLog: (label: string, value: unknown) => void,
  appendWarn: (label: string, value: unknown) => void
) {
  if (typeof window === "undefined" || !window.RTCPeerConnection) return () => undefined;

  const Original = window.RTCPeerConnection;
  let counter = 0;
  let turnProbeStarted = false;

  const runTurnProbe = (configuration: RTCConfiguration, id: number) => {
    if (turnProbeStarted) return;
    turnProbeStarted = true;

    const probePc = new Original(configuration);
    const seenCandidates: Array<Record<string, unknown>> = [];
    let finished = false;
    const finish = (reason: string) => {
      if (finished) return;
      finished = true;
      appendLog("[Safari TURN probe result]", { sourcePcId: id, reason, candidates: seenCandidates });
      probePc.close();
    };

    appendLog("[Safari TURN probe start]", { sourcePcId: id });
    appendLog("[Safari TURN probe config]", {
      sourcePcId: id,
      configuration: {
        iceTransportPolicy: configuration.iceTransportPolicy,
        iceServers: summarizeIceServers(configuration.iceServers)
      }
    });

    probePc.createDataChannel("turn-probe");
    probePc.addEventListener("icecandidate", (event) => {
      if (!event.candidate) {
        finish("completed");
        return;
      }
      const candidateSummary = summarizeCandidate(event.candidate.candidate);
      seenCandidates.push(candidateSummary);
      appendLog("[Safari TURN probe candidate]", { sourcePcId: id, ...candidateSummary });
    });
    probePc.addEventListener("icecandidateerror", (event: Event) => {
      const errorEvent = event as RTCPeerConnectionIceErrorEvent;
      appendWarn("[Safari TURN probe candidateerror]", {
        sourcePcId: id,
        address: errorEvent.address,
        port: errorEvent.port,
        url: errorEvent.url,
        errorCode: errorEvent.errorCode,
        errorText: errorEvent.errorText
      });
    });
    void probePc
      .createOffer()
      .then((offer) => probePc.setLocalDescription(offer))
      .catch((error) => {
        appendWarn("[Safari TURN probe error]", { sourcePcId: id, error: error instanceof Error ? error.message : "unknown" });
        finish("offer-failed");
      });

    window.setTimeout(() => finish("timeout"), 6000);
  };

  const Wrapped = function (
    this: RTCPeerConnection,
    configuration?: RTCConfiguration,
    ...rest: unknown[]
  ) {
    const id = ++counter;
    const effectiveConfiguration: RTCConfiguration = {
      ...(configuration ?? {}),
      iceTransportPolicy: "relay"
    };

    const configurationSummary = {
      iceTransportPolicy: effectiveConfiguration.iceTransportPolicy,
      bundlePolicy: effectiveConfiguration.bundlePolicy,
      rtcpMuxPolicy: effectiveConfiguration.rtcpMuxPolicy,
      iceServers: summarizeIceServers(effectiveConfiguration.iceServers)
    };
    appendLog("[Safari RTC create]", { id, configuration: configurationSummary });
    runTurnProbe(effectiveConfiguration, id);

    const pc = new Original(effectiveConfiguration, ...(rest as []));
    const originalSetConfiguration = pc.setConfiguration.bind(pc);
    pc.setConfiguration = (nextConfiguration: RTCConfiguration) => {
      const effectiveNextConfiguration: RTCConfiguration = {
        ...(nextConfiguration ?? {}),
        iceTransportPolicy: "relay"
      };
      appendLog("[Safari RTC setConfiguration]", {
        id,
        configuration: {
          iceTransportPolicy: effectiveNextConfiguration.iceTransportPolicy,
          bundlePolicy: effectiveNextConfiguration.bundlePolicy,
          rtcpMuxPolicy: effectiveNextConfiguration.rtcpMuxPolicy,
          iceServers: summarizeIceServers(effectiveNextConfiguration.iceServers)
        }
      });
      return originalSetConfiguration(effectiveNextConfiguration);
    };

    pc.addEventListener("signalingstatechange", () => {
      appendLog("[Safari RTC signalingstate]", { id, state: pc.signalingState });
    });
    pc.addEventListener("icegatheringstatechange", () => {
      appendLog("[Safari RTC icegatheringstate]", { id, state: pc.iceGatheringState });
    });
    pc.addEventListener("iceconnectionstatechange", () => {
      appendLog("[Safari RTC iceconnectionstate]", { id, state: pc.iceConnectionState });
    });
    pc.addEventListener("connectionstatechange", () => {
      appendLog("[Safari RTC connectionstate]", { id, state: pc.connectionState });
    });
    pc.addEventListener("icecandidate", (event) => {
      if (!event.candidate) {
        appendLog("[Safari RTC icecandidate]", { id, done: true });
        return;
      }
      appendLog("[Safari RTC icecandidate]", { id, ...summarizeCandidate(event.candidate.candidate) });
    });
    pc.addEventListener("icecandidateerror", (event: Event) => {
      const errorEvent = event as RTCPeerConnectionIceErrorEvent;
      appendWarn("[Safari RTC icecandidateerror]", {
        id,
        address: errorEvent.address,
        port: errorEvent.port,
        url: errorEvent.url,
        errorCode: errorEvent.errorCode,
        errorText: errorEvent.errorText
      });
    });

    const statsTimer = window.setInterval(() => {
      void pc
        .getStats()
        .then((report) => {
          const interesting: Array<Record<string, unknown>> = [];
          report.forEach((stat) => {
            if (stat.type === "candidate-pair") {
              interesting.push({
                type: stat.type,
                state: "state" in stat ? stat.state : undefined,
                nominated: "nominated" in stat ? stat.nominated : undefined,
                selected: "selected" in stat ? stat.selected : undefined,
                localCandidateId: "localCandidateId" in stat ? stat.localCandidateId : undefined,
                remoteCandidateId: "remoteCandidateId" in stat ? stat.remoteCandidateId : undefined,
                bytesSent: "bytesSent" in stat ? stat.bytesSent : undefined,
                bytesReceived: "bytesReceived" in stat ? stat.bytesReceived : undefined
              });
            }
            if (stat.type === "local-candidate" || stat.type === "remote-candidate") {
              interesting.push({
                type: stat.type,
                candidateType: "candidateType" in stat ? stat.candidateType : undefined,
                protocol: "protocol" in stat ? stat.protocol : undefined,
                address: "address" in stat ? stat.address : undefined,
                port: "port" in stat ? stat.port : undefined,
                url: "url" in stat ? stat.url : undefined,
                relayProtocol: "relayProtocol" in stat ? stat.relayProtocol : undefined
              });
            }
          });
          if (interesting.length > 0) {
            appendLog("[Safari RTC stats]", { id, stats: interesting });
          }
        })
        .catch(() => undefined);
    }, 3000);

    const stopStats = () => window.clearInterval(statsTimer);
    pc.addEventListener("connectionstatechange", () => {
      if (pc.connectionState === "connected" || pc.connectionState === "failed" || pc.connectionState === "closed") stopStats();
    });
    pc.addEventListener("iceconnectionstatechange", () => {
      if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") stopStats();
    });

    return pc;
  } as unknown as typeof RTCPeerConnection;

  Wrapped.prototype = Original.prototype;
  window.RTCPeerConnection = Wrapped;

  return () => {
    window.RTCPeerConnection = Original;
  };
}

export function LiveKitSafariDebug({ roomId, inviteCode }: LiveKitSafariDebugProps) {
  const { identity, loaded, clerkEnabled, signedIn, setRole, setIdentity } = usePersistentIdentity();
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [status, setStatus] = useState("Idle");

  const canRun = useMemo(() => loaded && (!clerkEnabled || signedIn) && !running, [loaded, clerkEnabled, signedIn, running]);

  function append(level: "log" | "warn", label: string, value: unknown) {
    const serialized = (() => {
      try {
        return typeof value === "string" ? value : JSON.stringify(value);
      } catch {
        return String(value);
      }
    })();
    const line = `${label} ${serialized}`;
    if (level === "warn") {
      console.warn(label, value);
    } else {
      console.log(label, value);
    }
    setLogs((current) => [...current, line]);
  }

  async function runTest() {
    setRunning(true);
    setLogs([]);
    setSessionSummary(null);
    setStatus("Fetching room session...");

    let restoreProbe: (() => void) | undefined;
    try {
      await warmSafariPermissions(
        (label, value) => append("log", label, value),
        (label, value) => append("warn", label, value)
      );

      const session = await joinRoom(identity, roomId, inviteCode ? { viewMode: "3d", inviteCode } : { viewMode: "3d" });
      const summary: SessionSummary = {
        roomId: session.room.id,
        livekitUrl: session.livekitUrl,
        participantId: session.participantId,
        participantIdentity: session.participantIdentity,
        role: session.role,
        tokenPreview: maskToken(session.token),
        token: summarizeToken(session.token)
      };
      setSessionSummary(summary);
      append("log", "[Debug session]", summary);

      if (isSafariBrowser()) {
        restoreProbe = installRtcProbe(
          (label, value) => append("log", label, value),
          (label, value) => append("warn", label, value)
        );
      }

      const { Room } = await import("livekit-client");
      const room = new Room({
        adaptiveStream: true,
        dynacast: true
      });
      append("log", "[Debug bare connect start]", { livekitUrl: session.livekitUrl, policy: "relay" });
      setStatus("Running bare LiveKit connect...");
      await room.connect(session.livekitUrl, session.token);
      append("log", "[Debug bare connect success]", {
        name: room.name,
        state: room.state,
        remoteParticipants: room.remoteParticipants.size
      });
      room.disconnect();
      setStatus("Bare LiveKit connect succeeded.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown failure";
      append("warn", "[Debug bare connect failure]", { message });
      setStatus(message);
    } finally {
      restoreProbe?.();
      setRunning(false);
    }
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "72rem", margin: "0 auto" }}>
      <section className="panel stack">
        <div className="stack">
          <h1 style={{ margin: 0 }}>Safari LiveKit Debug</h1>
          <p className="small" style={{ margin: 0 }}>
            Minimal repro: session fetch, Safari permission warmup, raw TURN probe, and bare <code>room.connect()</code>.
          </p>
        </div>

        <AuthGate />

        {!clerkEnabled ? (
          <div className="cluster">
            <label>
              Role
              <select value={identity.userId} onChange={(event) => setRole(event.target.value === "dev-teacher" ? "teacher" : "student")}>
                <option value="dev-teacher">Teacher (dev)</option>
                <option value="dev-student">Student (dev)</option>
              </select>
            </label>
            <label>
              Display name
              <input
                value={identity.displayName}
                onChange={(event) => setIdentity({ role: identity.role, displayName: event.target.value, userId: identity.userId })}
              />
            </label>
          </div>
        ) : null}

        <div className="cluster">
          <div className="status-pill">
            <span className="status-dot" />
            {status}
          </div>
          <span className="small">Room: {roomId}</span>
          {inviteCode ? <span className="small">Invite: {inviteCode}</span> : null}
          <button type="button" onClick={() => void runTest()} disabled={!canRun}>
            {running ? "Running…" : "Run test"}
          </button>
        </div>

        {sessionSummary ? (
          <div className="stack">
            <h2 className="lobby-section-title">Session</h2>
            <pre style={{ margin: 0, overflowX: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(sessionSummary, null, 2)}</pre>
          </div>
        ) : null}

        <div className="stack">
          <h2 className="lobby-section-title">Logs</h2>
          <pre style={{ margin: 0, minHeight: "20rem", overflowX: "auto", whiteSpace: "pre-wrap" }}>
            {logs.length > 0 ? logs.join("\n") : "No logs yet."}
          </pre>
        </div>
      </section>
    </main>
  );
}
