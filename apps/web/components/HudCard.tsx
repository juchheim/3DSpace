"use client";

import { useEffect, useState, type ReactNode } from "react";

export function HudCard({
  title,
  badge,
  ariaLabel,
  defaultCollapsed = false,
  forceExpanded = false,
  hasAlert = false,
  onAlertDismiss,
  children
}: {
  title: string;
  badge?: ReactNode;
  ariaLabel?: string;
  defaultCollapsed?: boolean;
  forceExpanded?: boolean;
  hasAlert?: boolean;
  onAlertDismiss?: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  useEffect(() => {
    if (!forceExpanded) return;
    setCollapsed(false);
  }, [forceExpanded]);

  return (
    <div className={`hud-card${collapsed ? " hud-card--collapsed" : ""}`} aria-label={ariaLabel}>
      <button
        type="button"
        className="hud-heading hud-heading-btn"
        aria-expanded={!collapsed}
        onClick={() => {
          setCollapsed((c) => {
            if (c) onAlertDismiss?.();
            return !c;
          });
        }}
      >
        {hasAlert ? <span className="hud-alert-dot" aria-hidden="true" /> : null}
        <span>{title}</span>
        <span className="hud-heading-end">
          {badge !== undefined ? <span>{badge}</span> : null}
          <span className={`hud-chevron${collapsed ? "" : " hud-chevron--open"}`} aria-hidden="true">›</span>
        </span>
      </button>
      {!collapsed ? (
        <div className="hud-card-body" onClick={() => onAlertDismiss?.()}>{children}</div>
      ) : null}
    </div>
  );
}
