import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createIdThrottle } from "../lib/idThrottle";

describe("createIdThrottle", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("emits the first push immediately (leading edge)", () => {
    const emit = vi.fn();
    const t = createIdThrottle<number>(emit, 70);
    t.push("a", 1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith(1);
  });

  it("collapses rapid pushes within a window to a single trailing emit", () => {
    const emit = vi.fn();
    const t = createIdThrottle<number>(emit, 70);
    t.push("a", 1); // leading
    t.push("a", 2);
    t.push("a", 3); // only the latest survives the window
    expect(emit).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(70);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(3);
  });

  it("closes the window when no further pushes arrive", () => {
    const emit = vi.fn();
    const t = createIdThrottle<number>(emit, 70);
    t.push("a", 1); // leading
    vi.advanceTimersByTime(70); // no pending → window closes, no extra emit
    expect(emit).toHaveBeenCalledTimes(1);
    t.push("a", 2); // window closed → leading again
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(2);
  });

  it("throttles per id independently", () => {
    const emit = vi.fn();
    const t = createIdThrottle<number>(emit, 70);
    t.push("a", 1);
    t.push("b", 10);
    expect(emit).toHaveBeenCalledTimes(2); // both leading
    t.push("a", 2);
    t.push("b", 20);
    vi.advanceTimersByTime(70);
    expect(emit).toHaveBeenCalledTimes(4);
  });

  it("flush emits now and cancels the pending trailing value", () => {
    const emit = vi.fn();
    const t = createIdThrottle<number>(emit, 70);
    t.push("a", 1); // leading
    t.push("a", 2); // pending trailing
    t.flush("a", 99);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith(99);
    vi.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(2); // pending 2 was dropped by flush
  });

  it("cancel drops the pending value without emitting", () => {
    const emit = vi.fn();
    const t = createIdThrottle<number>(emit, 70);
    t.push("a", 1); // leading
    t.push("a", 2); // pending
    t.cancel("a");
    vi.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("dispose clears outstanding timers", () => {
    const emit = vi.fn();
    const t = createIdThrottle<number>(emit, 70);
    t.push("a", 1);
    t.push("a", 2);
    t.dispose();
    vi.advanceTimersByTime(200);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});
