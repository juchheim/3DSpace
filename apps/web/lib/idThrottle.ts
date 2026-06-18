/**
 * A leading + trailing throttle keyed by id. Each `push(id, value)` either fires
 * immediately (leading edge, when no window is open for that id) or is held as
 * the latest pending value and emitted once when the current window closes
 * (trailing edge). At most one emit per `intervalMs` per id.
 *
 * Used to keep optimistic light edits broadcasting smoothly during a 60 fps
 * gizmo drag without flooding the realtime data channel — local state still
 * updates every call; only the *broadcast* is throttled.
 */
type Timer = ReturnType<typeof setTimeout>;

export type IdThrottle<T> = {
  /** Throttled emit for `id`. */
  push: (id: string, value: T) => void;
  /** Cancel any pending value for `id` and emit `value` now (resets the window). */
  flush: (id: string, value: T) => void;
  /** Drop any pending value and close the window for `id` without emitting. */
  cancel: (id: string) => void;
  /** Clear all timers and pending values (call on unmount). */
  dispose: () => void;
};

export function createIdThrottle<T>(emit: (value: T) => void, intervalMs: number): IdThrottle<T> {
  const timers = new Map<string, Timer>();
  const pending = new Map<string, T>();

  function fire(id: string) {
    if (pending.has(id)) {
      const value = pending.get(id) as T;
      pending.delete(id);
      emit(value);
      timers.set(id, setTimeout(() => fire(id), intervalMs));
    } else {
      timers.delete(id);
    }
  }

  function close(id: string) {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
  }

  return {
    push(id, value) {
      if (timers.has(id)) {
        // Window already open — hold as the trailing value.
        pending.set(id, value);
        return;
      }
      emit(value);
      timers.set(id, setTimeout(() => fire(id), intervalMs));
    },
    flush(id, value) {
      close(id);
      pending.delete(id);
      emit(value);
    },
    cancel(id) {
      close(id);
      pending.delete(id);
    },
    dispose() {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      pending.clear();
    },
  };
}
