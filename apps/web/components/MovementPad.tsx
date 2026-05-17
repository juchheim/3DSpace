"use client";

type MovementPadProps = {
  onVector(vector: { x: number; z: number }): void;
};

export function MovementPad({ onVector }: MovementPadProps) {
  const stop = () => onVector({ x: 0, z: 0 });

  function btn(label: string, symbol: string, vector: { x: number; z: number }, area: string) {
    return (
      <button
        type="button"
        aria-label={label}
        className={`dpad-btn dpad-${area}`}
        onPointerDown={() => onVector(vector)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        {symbol}
      </button>
    );
  }

  return (
    <div className="dpad" aria-label="Movement controls">
      {btn("Forward", "↑", { x: 0, z: -1 }, "fwd")}
      {btn("Left",    "←", { x: -1, z: 0 }, "left")}
      {btn("Back",    "↓", { x: 0, z: 1 },  "back")}
      {btn("Right",   "→", { x: 1, z: 0 },  "right")}
    </div>
  );
}
