type TimerRuntime = {
  elapsedSeconds: number;
  resetGeneration: number;
  resetSuppressUntil: number;
};

const runtimeByObjectId = new Map<string, TimerRuntime>();
const listenersByObjectId = new Map<string, Set<() => void>>();

const EMPTY_TIMER_RUNTIME: TimerRuntime = Object.freeze({
  elapsedSeconds: 0,
  resetGeneration: 0,
  resetSuppressUntil: 0
});

function readRuntime(objectId: string) {
  return runtimeByObjectId.get(objectId) ?? EMPTY_TIMER_RUNTIME;
}

function emit(objectId: string) {
  listenersByObjectId.get(objectId)?.forEach((listener) => listener());
}

export function subscribeTimerRuntime(objectId: string, listener: () => void) {
  const listeners = listenersByObjectId.get(objectId) ?? new Set();
  listeners.add(listener);
  listenersByObjectId.set(objectId, listeners);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersByObjectId.delete(objectId);
  };
}

export function getTimerRuntimeSnapshot(objectId: string) {
  return readRuntime(objectId);
}

export function pushTimerElapsed(objectId: string, elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return;
  const now = Date.now();
  const state = readRuntime(objectId);
  if (now < state.resetSuppressUntil) return;
  const next = Math.floor(elapsedSeconds);
  if (next <= state.elapsedSeconds) return;
  runtimeByObjectId.set(objectId, { ...state, elapsedSeconds: next });
  emit(objectId);
}

export function forceTimerElapsed(objectId: string, elapsedSeconds: number) {
  const next = Math.max(0, Math.floor(elapsedSeconds));
  const state = readRuntime(objectId);
  if (state.elapsedSeconds === next) return;
  runtimeByObjectId.set(objectId, { ...state, elapsedSeconds: next });
  emit(objectId);
}

export function resetTimerRuntime(objectId: string) {
  const state = readRuntime(objectId);
  runtimeByObjectId.set(objectId, {
    elapsedSeconds: 0,
    resetGeneration: state.resetGeneration + 1,
    resetSuppressUntil: Date.now() + 750
  });
  emit(objectId);
}

export function timerElapsedForResume(objectId: string, serverPositionSeconds: number) {
  return Math.max(0, Math.floor(Math.max(readRuntime(objectId).elapsedSeconds, serverPositionSeconds)));
}
