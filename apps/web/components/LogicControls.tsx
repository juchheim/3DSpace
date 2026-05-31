"use client";

import { useId, useState } from "react";
import { logicChannelColor, logicRoleForKind } from "@3dspace/room-engine";
import type { LogicModeController, LogicTool } from "../lib/useLogicMode";

const TOOL_OPTIONS: Array<{ id: LogicTool; label: string }> = [
  { id: "button", label: "Button" },
  { id: "pressurePlate", label: "Plate" },
  { id: "proximityZone", label: "Zone" },
  { id: "timer", label: "Timer" },
  { id: "door", label: "Door" },
  { id: "light", label: "Light" },
  { id: "teleporter", label: "Teleport" },
  { id: "destroy", label: "Remove" }
];

const FIRE_MODES: Array<{ id: "pulse" | "toggle" | "whileHeld"; label: string }> = [
  { id: "pulse", label: "Pulse" },
  { id: "toggle", label: "Toggle" },
  { id: "whileHeld", label: "While held" }
];

const LISTEN_MODES: Array<{ id: "momentary" | "toggle" | "latch"; label: string }> = [
  { id: "momentary", label: "Momentary" },
  { id: "toggle", label: "Toggle" },
  { id: "latch", label: "Latch" }
];

function ToolOptions({ logicMode }: { logicMode: LogicModeController }) {
  const tool = logicMode.tool;
  if (tool === "destroy") return null;
  if (tool === "teleporter") {
    return (
      <label className="logic-controls-dock__opt">
        Link
        <span
          className="logic-controls-dock__swatch"
          style={{ background: logicMode.linkId ? logicChannelColor(logicMode.linkId) : "transparent" }}
          aria-hidden
        />
        <input
          type="text"
          className="logic-controls-dock__opt-input"
          value={logicMode.linkId}
          onChange={(e) => logicMode.setLinkId(e.target.value)}
          maxLength={64}
          placeholder="link-1"
        />
      </label>
    );
  }
  const role = logicRoleForKind(tool);
  if (role === "consumer") {
    return (
      <label className="logic-controls-dock__opt">
        Reacts
        <select
          className="logic-controls-dock__opt-select"
          value={logicMode.listenMode}
          onChange={(e) => logicMode.setListenMode(e.target.value as typeof logicMode.listenMode)}
        >
          {LISTEN_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <>
      <label className="logic-controls-dock__opt">
        Fires
        <select
          className="logic-controls-dock__opt-select"
          value={logicMode.fireMode}
          onChange={(e) => logicMode.setFireMode(e.target.value as typeof logicMode.fireMode)}
        >
          {FIRE_MODES.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {tool === "pressurePlate" || tool === "proximityZone" ? (
        <label className="logic-controls-dock__opt logic-controls-dock__opt--check">
          <input
            type="checkbox"
            checked={logicMode.isExit}
            onChange={(e) => logicMode.setIsExit(e.target.checked)}
          />
          Win exit
        </label>
      ) : null}
      {tool === "timer" ? (
        <label className="logic-controls-dock__opt">
          Delay&nbsp;ms
          <input
            type="number"
            className="logic-controls-dock__opt-input"
            value={logicMode.delayMs}
            min={0}
            max={600000}
            step={250}
            onChange={(e) => logicMode.setDelayMs(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
      ) : null}
    </>
  );
}

export function LogicControls({
  logicMode,
  pieceCount,
  existingChannels,
  canApplyStarterKit = false,
  onApplyStarterKit,
  onClearAll
}: {
  logicMode: LogicModeController;
  pieceCount: number;
  existingChannels: string[];
  canApplyStarterKit?: boolean;
  onApplyStarterKit?: () => Promise<void>;
  onClearAll(): Promise<void>;
}) {
  const [clearing, setClearing] = useState(false);
  const [stamping, setStamping] = useState(false);
  const channelListId = useId();
  const showChannel = logicMode.tool !== "destroy" && logicMode.tool !== "teleporter";

  return (
    <div className="logic-controls-dock" aria-label="Logic controls">
      <div className="logic-controls-dock__bar">
        <button
          type="button"
          className={`logic-controls-dock__toggle hud-btn${logicMode.enabled ? " logic-controls-dock__toggle--on" : ""}`}
          onClick={logicMode.toggle}
        >
          {logicMode.enabled ? "Logic on" : "Logic off"}
        </button>

        {logicMode.enabled ? (
          <>
            <div className="logic-controls-dock__tools" role="toolbar">
              {TOOL_OPTIONS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className={`logic-controls-dock__tool hud-btn${logicMode.tool === tool.id ? " logic-controls-dock__tool--active" : ""}`}
                  aria-pressed={logicMode.tool === tool.id}
                  onClick={() => logicMode.setTool(tool.id)}
                >
                  {tool.label}
                </button>
              ))}
            </div>
            {showChannel ? (
              <label className="logic-controls-dock__channel">
                Channel
                <span
                  className="logic-controls-dock__swatch"
                  style={{
                    background: logicMode.channelId ? logicChannelColor(logicMode.channelId) : "transparent"
                  }}
                  aria-hidden
                />
                <input
                  type="text"
                  list={channelListId}
                  className="logic-controls-dock__channel-input"
                  value={logicMode.channelId}
                  onChange={(e) => logicMode.setChannelId(e.target.value)}
                  maxLength={64}
                  placeholder="channel id"
                />
                <datalist id={channelListId}>
                  {existingChannels.map((channel) => (
                    <option key={channel} value={channel} />
                  ))}
                </datalist>
              </label>
            ) : null}
            <ToolOptions logicMode={logicMode} />
            {canApplyStarterKit ? (
              <button
                type="button"
                className="logic-controls-dock__starter hud-btn"
                disabled={stamping}
                onClick={() => {
                  setStamping(true);
                  void Promise.resolve(onApplyStarterKit?.())
                    .catch((err) =>
                      logicMode.setStatusMessage(
                        err instanceof Error ? err.message : "Unable to stamp starter kit."
                      )
                    )
                    .finally(() => setStamping(false));
                }}
              >
                {stamping ? "Stamping…" : "Starter kit"}
              </button>
            ) : null}
            <button
              type="button"
              className="logic-controls-dock__clear hud-btn"
              disabled={clearing || pieceCount === 0}
              onClick={() => {
                if (!window.confirm(`Clear all ${pieceCount} logic node${pieceCount === 1 ? "" : "s"}?`)) return;
                setClearing(true);
                void onClearAll()
                  .then(() => logicMode.setStatusMessage("Logic cleared."))
                  .catch((err) =>
                    logicMode.setStatusMessage(err instanceof Error ? err.message : "Unable to clear logic.")
                  )
                  .finally(() => setClearing(false));
              }}
            >
              {clearing ? "Clearing…" : "Clear logic"}
            </button>
          </>
        ) : (
          <p className="logic-controls-dock__hint">Place trigger blocks — author only, syncs to all clients.</p>
        )}
        <span className="logic-controls-dock__count">{pieceCount}</span>
      </div>
      {logicMode.statusMessage ? <p className="logic-controls-dock__status">{logicMode.statusMessage}</p> : null}
    </div>
  );
}
