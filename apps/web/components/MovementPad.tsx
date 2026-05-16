"use client";

type MovementPadProps = {
  onVector(vector: { x: number; z: number }): void;
};

export function MovementPad({ onVector }: MovementPadProps) {
  const stop = () => onVector({ x: 0, z: 0 });
  const start = (vector: { x: number; z: number }) => onVector(vector);

  function button(label: string, vector: { x: number; z: number }) {
    return (
      <button
        type="button"
        aria-label={label}
        onPointerDown={() => start(vector)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
      >
        {label}
      </button>
    );
  }

  return (
    <section className="movement-pad" aria-label="Touch movement controls">
      <strong className="small">Move</strong>
      <div className="movement-pad-row">{button("Forward", { x: 0, z: -1 })}</div>
      <div className="movement-pad-row">
        {button("Left", { x: -1, z: 0 })}
        {button("Back", { x: 0, z: 1 })}
        {button("Right", { x: 1, z: 0 })}
      </div>
    </section>
  );
}
