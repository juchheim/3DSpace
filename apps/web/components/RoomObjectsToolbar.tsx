"use client";

import { useMemo, useState } from "react";
import type { ClassroomGroup, Role, RoomManifest, RoomObject, RoomObjectTemplate } from "@3dspace/contracts";
import { HudCard } from "./HudCard";
import { RoomObjectInspector } from "./RoomObjectInspector";
import type { ParticipantView } from "./RoomClient";
import {
  isRoomObjectTemplatePlaceable,
  isRoomObjectTemplateSelectableInV1,
  ROOM_OBJECT_HERO_SLUG
} from "../lib/roomObjectInteraction";

export function RoomObjectsToolbar({
  templates,
  objects,
  manifest,
  localAvatarPosition,
  localAvatarYaw,
  loading,
  error,
  selectedObjectId,
  role,
  currentUserId,
  memberGroupIds,
  participants,
  classroomGroups,
  actions,
  onSelectObject,
  onInstantiate,
  onRemove
}: {
  templates: RoomObjectTemplate[];
  objects: RoomObject[];
  manifest: RoomManifest;
  localAvatarPosition: { x: number; y: number; z: number };
  localAvatarYaw: number;
  loading: boolean;
  error: string;
  selectedObjectId: string | null;
  role: Role;
  currentUserId: string;
  memberGroupIds: string[];
  participants: ParticipantView[];
  classroomGroups: ClassroomGroup[];
  actions: Parameters<typeof RoomObjectInspector>[0]["actions"];
  onSelectObject(objectId: string | null): void;
  onInstantiate(templateId: string): Promise<void>;
  onRemove(objectId: string): Promise<void>;
}) {
  const [placingId, setPlacingId] = useState<string | null>(null);
  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) ?? null,
    [objects, selectedObjectId]
  );
  const selectedTemplate = useMemo(
    () => (selectedObject ? templates.find((template) => template.id === selectedObject.templateId) ?? null : null),
    [selectedObject, templates]
  );
  const catalog = [...templates].sort((left, right) => {
    if (left.slug === ROOM_OBJECT_HERO_SLUG) return -1;
    if (right.slug === ROOM_OBJECT_HERO_SLUG) return 1;
    return left.displayName.localeCompare(right.displayName);
  });

  return (
    <div className="room-object-toolbar-shell">
      {selectedObject && selectedTemplate ? (
        <div className="room-object-toolbar__dock" aria-label={`${selectedObject.displayName} inspector`}>
          <RoomObjectInspector
            key={selectedObject.id}
            object={selectedObject}
            template={selectedTemplate}
            role={role}
            currentUserId={currentUserId}
            memberGroupIds={memberGroupIds}
            participants={participants}
            classroomGroups={classroomGroups}
            visible={true}
            actions={actions}
            onClose={() => onSelectObject(null)}
          />
        </div>
      ) : null}
      <HudCard
        title="Objects"
        badge={loading ? "…" : objects.length}
        ariaLabel="Room objects"
        defaultCollapsed={false}
        forceExpanded={Boolean(selectedObject)}
      >
        {error ? <p className="room-object-toolbar__error">{error}</p> : null}
        <div className="room-object-toolbar-card">
          <span className="room-object-toolbar__heading">Catalog</span>
          <ul className="room-object-toolbar__catalog">
            {catalog.map((template) => {
              const placeable = isRoomObjectTemplatePlaceable(template);
              const selectable = isRoomObjectTemplateSelectableInV1(template);
              const isHero = template.slug === ROOM_OBJECT_HERO_SLUG;
              return (
                <li
                  key={template.id}
                  className={`room-object-toolbar__item${selectable ? "" : " room-object-coming-soon"}`}
                  data-testid={`room-object-catalog-${template.slug}`}
                >
                  <div className="room-object-toolbar__thumb-wrap">
                    {template.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={template.thumbnailUrl} alt="" className="room-object-toolbar__thumb" />
                    ) : (
                      <span className="room-object-toolbar__thumb-fallback" aria-hidden="true">
                        {template.category.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="room-object-toolbar__copy">
                    <span className="room-object-toolbar__name">
                      {template.displayName}
                      {isHero ? <span className="room-object-toolbar__hero-badge">District demo</span> : null}
                    </span>
                    <span className="room-object-toolbar__category">{template.category}</span>
                    <p className="room-object-toolbar__desc">{template.description}</p>
                  </div>
                  {selectable ? (
                    <button
                      type="button"
                      className="hud-btn"
                      data-testid={`room-object-place-${template.slug}`}
                      disabled={placingId === template.id || !placeable}
                      onClick={() => {
                        setPlacingId(template.id);
                        void onInstantiate(template.id).finally(() => setPlacingId(null));
                      }}
                    >
                      {placingId === template.id ? "Placing…" : "Place"}
                    </button>
                  ) : (
                    <span className="room-object-toolbar__soon">Coming soon</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="room-object-toolbar-card">
          <span className="room-object-toolbar__heading">Active in room</span>
          {objects.length === 0 ? (
            <p className="room-object-toolbar__empty">No objects placed yet.</p>
          ) : (
            <ul className="room-object-toolbar__active">
              {objects.map((object) => (
                <li key={object.id} className="room-object-toolbar__active-row">
                  <button
                    type="button"
                    className={`room-object-toolbar__inspect${selectedObjectId === object.id ? " room-object-toolbar__inspect--active" : ""}`}
                    onClick={() => onSelectObject(selectedObjectId === object.id ? null : object.id)}
                  >
                    {object.displayName}
                  </button>
                  <button
                    type="button"
                    className="hud-btn room-object-toolbar__remove"
                    onClick={() => void onRemove(object.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </HudCard>
    </div>
  );
}
