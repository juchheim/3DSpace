"use client";

import { useState, type ReactNode } from "react";

export function HudCard({
  title,
  badge,
  ariaLabel,
  defaultCollapsed = false,
  children
}: {
  title: string;
  badge?: ReactNode;
  ariaLabel?: string;
  defaultCollapsed?: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={`hud-card${collapsed ? " hud-card--collapsed" : ""}`} aria-label={ariaLabel}>
      <button
        type="button"
        className="hud-heading hud-heading-btn"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((c) => !c)}
      >
        <span>{title}</span>
        <span className="hud-heading-end">
          {badge !== undefined ? <span>{badge}</span> : null}
          <span className={`hud-chevron${collapsed ? "" : " hud-chevron--open"}`} aria-hidden="true">›</span>
        </span>
      </button>
      {!collapsed ? children : null}
    </div>
  );
}
