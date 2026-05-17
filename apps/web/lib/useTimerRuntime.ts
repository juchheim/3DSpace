"use client";

import { useCallback, useSyncExternalStore } from "react";
import { getTimerRuntimeSnapshot, subscribeTimerRuntime } from "./timerRuntime";

export function useTimerRuntime(objectId: string) {
  const subscribe = useCallback((onStoreChange: () => void) => subscribeTimerRuntime(objectId, onStoreChange), [objectId]);
  const getSnapshot = useCallback(() => getTimerRuntimeSnapshot(objectId), [objectId]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
