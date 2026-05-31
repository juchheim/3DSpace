"use client";

import { useMemo } from "react";
import type { BuildLogicPiece, LogicState } from "@3dspace/contracts";
import {
  logicChannelColor,
  logicChannelsForPiece,
  logicRoleForKind
} from "@3dspace/room-engine";

const KIND_LABELS: Record<BuildLogicPiece["kind"], string> = {
  button: "Button",
  pressurePlate: "Pressure plate",
  proximityZone: "Proximity zone",
  timer: "Timer",
  door: "Door",
  light: "Light",
  teleporter: "Teleporter"
};

function ChannelChip({ channel }: { channel: string }) {
  return (
    <span className="logic-inspector__chip">
      <span className="logic-inspector__swatch" style={{ background: logicChannelColor(channel) }} aria-hidden />
      {channel}
    </span>
  );
}

export function LogicInspector({
  piece,
  pieces,
  logicState,
  onUpdate,
  onRemove,
  onSelect,
  onClose
}: {
  piece: BuildLogicPiece;
  pieces: BuildLogicPiece[];
  logicState: LogicState | null;
  onUpdate: (pieceId: string, patch: { channelId?: string; linkId?: string; config?: BuildLogicPiece["config"] }) => Promise<unknown>;
  onRemove: (pieceId: string) => Promise<unknown>;
  onSelect: (pieceId: string) => void;
  onClose: () => void;
}) {
  const role = logicRoleForKind(piece.kind);
  const nodeState = logicState?.nodes[piece.id];
  const channels = logicChannelsForPiece(piece);

  const peers = useMemo(() => {
    const myChannels = new Set(channels);
    return pieces.filter((other) => {
      if (other.id === piece.id) return false;
      if (piece.linkId && other.linkId === piece.linkId) return true;
      return logicChannelsForPiece(other).some((c) => myChannels.has(c));
    });
  }, [channels, piece.id, piece.linkId, pieces]);

  function patchConfig(partial: Partial<BuildLogicPiece["config"]>) {
    void onUpdate(piece.id, { config: { ...piece.config, ...partial } as BuildLogicPiece["config"] });
  }

  return (
    <div className="logic-inspector" role="dialog" aria-label="Logic inspector">
      <header className="logic-inspector__head">
        <div>
          <strong>{KIND_LABELS[piece.kind]}</strong>
          <span className="logic-inspector__role">{role}</span>
        </div>
        <button type="button" className="hud-btn logic-inspector__close" onClick={onClose} aria-label="Close inspector">
          ✕
        </button>
      </header>

      <dl className="logic-inspector__grid">
        <dt>Cell</dt>
        <dd>
          {piece.cell.ix}, {piece.cell.iz} · L{piece.level}
          {piece.edge ? ` · ${piece.edge}` : ""}
        </dd>
        <dt>ID</dt>
        <dd className="logic-inspector__mono">{piece.id.slice(-18)}</dd>
      </dl>

      {piece.kind === "teleporter" ? (
        <label className="logic-inspector__field">
          Link ID
          <input
            type="text"
            value={piece.linkId ?? ""}
            maxLength={64}
            onChange={(e) => void onUpdate(piece.id, { linkId: e.target.value })}
          />
        </label>
      ) : (
        <label className="logic-inspector__field">
          Channel
          <span className="logic-inspector__field-row">
            <span
              className="logic-inspector__swatch"
              style={{ background: piece.channelId ? logicChannelColor(piece.channelId) : "transparent" }}
              aria-hidden
            />
            <input
              type="text"
              value={piece.channelId ?? ""}
              maxLength={64}
              onChange={(e) => void onUpdate(piece.id, { channelId: e.target.value })}
            />
          </span>
        </label>
      )}

      {role === "emitter" && piece.kind !== "timer" ? (
        <label className="logic-inspector__field">
          Fires
          <select
            value={piece.config.fireMode}
            onChange={(e) => patchConfig({ fireMode: e.target.value as BuildLogicPiece["config"]["fireMode"] })}
          >
            <option value="pulse">Pulse</option>
            <option value="toggle">Toggle</option>
            <option value="whileHeld">While held</option>
          </select>
        </label>
      ) : null}

      {role === "consumer" && piece.kind !== "teleporter" ? (
        <label className="logic-inspector__field">
          Reacts
          <select
            value={piece.config.listenMode}
            onChange={(e) => patchConfig({ listenMode: e.target.value as BuildLogicPiece["config"]["listenMode"] })}
          >
            <option value="momentary">Momentary</option>
            <option value="toggle">Toggle</option>
            <option value="latch">Latch</option>
          </select>
        </label>
      ) : null}

      {piece.kind === "pressurePlate" || piece.kind === "proximityZone" ? (
        <label className="logic-inspector__field logic-inspector__field--check">
          <input
            type="checkbox"
            checked={piece.config.isExit === true}
            onChange={(e) => patchConfig({ isExit: e.target.checked })}
          />
          Win exit (ends session on step)
        </label>
      ) : null}

      {piece.kind === "timer" ? (
        <>
          <label className="logic-inspector__field">
            Delay (ms)
            <input
              type="number"
              min={0}
              max={600000}
              step={250}
              value={piece.config.delayMs}
              onChange={(e) => patchConfig({ delayMs: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
          <label className="logic-inspector__field">
            Repeat (ms, 0 = once)
            <input
              type="number"
              min={0}
              max={600000}
              step={250}
              value={piece.config.intervalMs}
              onChange={(e) => patchConfig({ intervalMs: Math.max(0, Number(e.target.value) || 0) })}
            />
          </label>
        </>
      ) : null}

      <div className="logic-inspector__section">
        <span className="logic-inspector__section-title">Runtime</span>
        {nodeState && Object.keys(nodeState).length > 0 ? (
          <ul className="logic-inspector__state">
            {Object.entries(nodeState).map(([key, value]) => (
              <li key={key}>
                <code>{key}</code>: {String(value)}
              </li>
            ))}
          </ul>
        ) : (
          <span className="logic-inspector__muted">No runtime state yet — start a play session.</span>
        )}
        {channels.length > 0 ? (
          <div className="logic-inspector__channels">
            {channels.map((channel) => {
              const state = logicState?.channels[channel];
              return (
                <div key={channel} className="logic-inspector__channel-row">
                  <ChannelChip channel={channel} />
                  <span className="logic-inspector__muted">{state?.latched ? "latched" : "idle"}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="logic-inspector__section">
        <span className="logic-inspector__section-title">Linked ({peers.length})</span>
        {peers.length > 0 ? (
          <ul className="logic-inspector__peers">
            {peers.map((peer) => (
              <li key={peer.id}>
                <button type="button" className="logic-inspector__peer" onClick={() => onSelect(peer.id)}>
                  {KIND_LABELS[peer.kind]} · {logicRoleForKind(peer.kind)}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="logic-inspector__muted">
            Nothing shares this {piece.kind === "teleporter" ? "link" : "channel"} yet.
          </span>
        )}
      </div>

      <button type="button" className="hud-btn logic-inspector__remove" onClick={() => void onRemove(piece.id)}>
        Remove node
      </button>
    </div>
  );
}
