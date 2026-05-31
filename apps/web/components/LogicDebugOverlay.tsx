"use client";

import { useEffect, useState } from "react";
import type { BuildLogicPiece, LogicState } from "@3dspace/contracts";
import {
  logicChannelColor,
  logicChannelsForPiece,
  logicChannelsFromPieces,
  logicRoleForKind
} from "@3dspace/room-engine";

const FRESH_WINDOW_MS = 600;

/** Author-only, play-mode overlay: live channel pulses + node states ("why didn't my door open"). */
export function LogicDebugOverlay({
  pieces,
  logicState
}: {
  pieces: BuildLogicPiece[];
  logicState: LogicState | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, []);

  const channels = logicChannelsFromPieces(pieces);
  const consumers = pieces.filter((piece) => logicRoleForKind(piece.kind) === "emitter" ? false : true);

  return (
    <div className="logic-debug-overlay" aria-label="Logic debug overlay">
      <strong>Logic debug</strong>
      <div className="logic-debug-overlay__group">
        <span className="logic-debug-overlay__label">Channels</span>
        {channels.length === 0 ? (
          <span className="logic-debug-empty">No channels wired.</span>
        ) : (
          <ul className="logic-debug-overlay__channels">
            {channels.map((channel) => {
              const state = logicState?.channels[channel];
              const fresh = state ? now - state.lastPulseAt < FRESH_WINDOW_MS : false;
              return (
                <li key={channel} className={fresh ? "logic-debug-overlay__channel--fresh" : ""}>
                  <span className="logic-debug-overlay__swatch" style={{ background: logicChannelColor(channel) }} aria-hidden />
                  <code>{channel}</code>
                  <span>{state?.latched ? "latched" : "idle"}</span>
                  {fresh ? <span className="logic-debug-overlay__pulse">pulse</span> : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="logic-debug-overlay__group">
        <span className="logic-debug-overlay__label">Nodes</span>
        {consumers.length === 0 ? (
          <span className="logic-debug-empty">No consumers placed.</span>
        ) : (
          <ul className="logic-debug-overlay__nodes">
            {consumers.map((piece) => {
              const node = logicState?.nodes[piece.id];
              const requires = logicChannelsForPiece(piece);
              const summary = node && Object.keys(node).length > 0
                ? Object.entries(node)
                    .map(([k, v]) => `${k}=${String(v)}`)
                    .join(" ")
                : "—";
              return (
                <li key={piece.id}>
                  <code>{piece.kind}</code>
                  <span className="logic-debug-overlay__muted">{requires.join(", ") || "no channel"}</span>
                  <span>{summary}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
