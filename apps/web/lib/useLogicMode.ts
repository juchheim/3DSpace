"use client";

import { useCallback, useMemo, useState } from "react";
import type { LogicConfigInput, LogicPieceKind } from "@3dspace/contracts";
import { logicRoleForKind } from "@3dspace/room-engine";

export type LogicTool = LogicPieceKind | "destroy";
export type LogicFireMode = "pulse" | "toggle" | "whileHeld";
export type LogicListenMode = "momentary" | "toggle" | "latch";

export type LogicPlacementConfig = {
  config: LogicConfigInput | undefined;
  linkId: string | undefined;
};

export function useLogicMode() {
  const [enabled, setEnabled] = useState(false);
  const [tool, setTool] = useState<LogicTool>("button");
  const [channelId, setChannelId] = useState("ch-1");
  const [fireMode, setFireMode] = useState<LogicFireMode>("pulse");
  const [listenMode, setListenMode] = useState<LogicListenMode>("latch");
  const [linkId, setLinkId] = useState("link-1");
  const [isExit, setIsExit] = useState(false);
  const [delayMs, setDelayMs] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  const toggle = useCallback(() => {
    setEnabled((current) => !current);
    setStatusMessage("");
  }, []);

  /** Build the config/linkId payload for the currently selected tool. */
  const buildPlacementConfig = useCallback((): LogicPlacementConfig => {
    if (tool === "destroy") return { config: undefined, linkId: undefined };
    if (tool === "teleporter") {
      return { config: undefined, linkId: linkId.trim() || undefined };
    }
    const role = logicRoleForKind(tool);
    const config: LogicConfigInput = {};
    if (role === "emitter") {
      config.fireMode = fireMode;
      if (isExit) config.isExit = true;
      if (tool === "timer" && delayMs > 0) config.delayMs = delayMs;
    } else {
      config.listenMode = listenMode;
    }
    return {
      config: Object.keys(config).length > 0 ? config : undefined,
      linkId: undefined
    };
  }, [delayMs, fireMode, isExit, linkId, listenMode, tool]);

  return useMemo(
    () => ({
      enabled,
      setEnabled,
      tool,
      setTool,
      channelId,
      setChannelId,
      fireMode,
      setFireMode,
      listenMode,
      setListenMode,
      linkId,
      setLinkId,
      isExit,
      setIsExit,
      delayMs,
      setDelayMs,
      toggle,
      buildPlacementConfig,
      statusMessage,
      setStatusMessage
    }),
    [
      buildPlacementConfig,
      channelId,
      delayMs,
      enabled,
      fireMode,
      isExit,
      linkId,
      listenMode,
      statusMessage,
      tool,
      toggle
    ]
  );
}

export type LogicModeController = ReturnType<typeof useLogicMode>;
