"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  ClassroomGroup,
  Pose,
  Role,
  RoomObject,
  RoomObjectTemplate,
  RoomObjectTouchPolicy
} from "@3dspace/contracts";
import { parseRoomObjectParameterSchemaJson } from "@3dspace/contracts";
import type { ParticipantView } from "./RoomClient";
import { canTouchRoomObject, scaleBounds } from "../lib/roomObjectInteraction";

type RoomObjectActions = {
  update(objectId: string, patch: { pose?: Pose; scale?: number; colorTintHex?: string }): Promise<unknown>;
  remove(objectId: string): Promise<void>;
  reset(objectId: string): Promise<unknown>;
  setTouch(
    objectId: string,
    touchPolicy: RoomObjectTouchPolicy,
    grants?: { userIds?: string[]; groupIds?: string[] }
  ): Promise<unknown>;
  setParameters(objectId: string, parameters: Record<string, unknown>): void;
};

export function RoomObjectInspector({
  object,
  template,
  role,
  currentUserId,
  memberGroupIds,
  participants,
  classroomGroups,
  visible,
  actions,
  onClose
}: {
  object: RoomObject;
  template: RoomObjectTemplate;
  role: Role;
  currentUserId: string;
  memberGroupIds: string[];
  participants: ParticipantView[];
  classroomGroups: ClassroomGroup[];
  visible: boolean;
  actions: RoomObjectActions;
  onClose?: () => void;
}) {
  const canTouch = canTouchRoomObject({ object, userId: currentUserId, role, memberGroupIds });
  const isTeacher = role === "teacher";
  const parameterSchema = useMemo(() => {
    try {
      return parseRoomObjectParameterSchemaJson(template.parameterSchemaJson);
    } catch {
      return {};
    }
  }, [template.parameterSchemaJson]);

  const [touchPolicyDraft, setTouchPolicyDraft] = useState<RoomObjectTouchPolicy>(object.touchPolicy);
  const [grantUserIds, setGrantUserIds] = useState<string[]>(object.grantedUserIds);
  const [grantGroupIds, setGrantGroupIds] = useState<string[]>(object.grantedGroupIds);
  const [poseDraft, setPoseDraft] = useState<Pose>(object.pose);
  const [scaleDraft, setScaleDraft] = useState(object.scale);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const { min: minScale, max: maxScale, step: scaleStep } = useMemo(
    () => scaleBounds(template.defaultScale),
    [template.defaultScale]
  );

  const students = useMemo(
    () => participants.filter((participant) => participant.role === "student"),
    [participants]
  );
  const activeGroups = useMemo(
    () => classroomGroups.filter((group) => group.status === "active"),
    [classroomGroups]
  );

  useEffect(() => {
    setTouchPolicyDraft(object.touchPolicy);
    setGrantUserIds(object.grantedUserIds);
    setGrantGroupIds(object.grantedGroupIds);
    setPoseDraft(object.pose);
    setScaleDraft(object.scale);
    setActionError("");
  }, [object.id, object.updatedAt, object.touchPolicy, object.grantedUserIds, object.grantedGroupIds, object.pose, object.scale]);

  if (!visible) return null;

  async function runAction(action: () => Promise<unknown>) {
    setBusy(true);
    setActionError("");
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update room object.");
      throw error;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="room-object-inspector room-object-html" data-testid={`room-object-inspector-${object.id}`}>
      <div className="room-object-inspector__header">
        <div>
          <h3 className="room-object-inspector__title">{object.displayName}</h3>
          <p className="room-object-inspector__chip">{template.displayName}</p>
          <p className="room-object-inspector__meta">
            {template.license} · {template.attribution}
          </p>
        </div>
        {onClose ? (
          <button type="button" className="room-object-inspector__close" onClick={onClose} aria-label="Close inspector">
            ×
          </button>
        ) : null}
      </div>

      {!canTouch ? (
        <p className="room-object-inspector__pill">Watching only</p>
      ) : null}

      <div className={`room-object-inspector__section${!canTouch ? " room-object-inspector__section--readonly" : ""}`}>
        <span className="room-object-inspector__label">Parameters</span>
        {Object.entries(parameterSchema).map(([key, field]) => {
          const value = object.parameters[key] ?? field.default;
          if (field.type === "boolean") {
            return (
              <label key={key} className="room-object-inspector__row">
                <span>{field.label}</span>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  disabled={!canTouch || busy}
                  onChange={(event) => {
                    actions.setParameters(object.id, { ...object.parameters, [key]: event.target.checked });
                  }}
                />
              </label>
            );
          }
          if (field.type === "enum") {
            return (
              <label key={key} className="room-object-inspector__row">
                <span>{field.label}</span>
                <select
                  value={typeof value === "string" ? value : field.default}
                  disabled={!canTouch || busy}
                  onChange={(event) => {
                    actions.setParameters(object.id, { ...object.parameters, [key]: event.target.value });
                  }}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          if (field.type === "number") {
            const numeric = typeof value === "number" ? value : field.default;
            const min = field.min ?? 0;
            const max = field.max ?? 100;
            const step = field.step ?? 1;
            return (
              <label key={key} className="room-object-inspector__row">
                <span>{field.label}</span>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={numeric}
                  disabled={!canTouch || busy}
                  onChange={(event) => {
                    actions.setParameters(object.id, { ...object.parameters, [key]: Number(event.target.value) });
                  }}
                />
              </label>
            );
          }
          if (field.type === "range") {
            const tuple = Array.isArray(value) ? value : field.default;
            const numeric = typeof tuple[0] === "number" ? tuple[0] : field.default[0];
            return (
              <label key={key} className="room-object-inspector__row">
                <span>{field.label}</span>
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step ?? 1}
                  value={numeric}
                  disabled={!canTouch || busy}
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    actions.setParameters(object.id, {
                      ...object.parameters,
                      [key]: [next, typeof tuple[1] === "number" ? tuple[1] : field.default[1]]
                    });
                  }}
                />
              </label>
            );
          }
          return null;
        })}
      </div>

      <div className={`room-object-inspector__section${!canTouch ? " room-object-inspector__section--readonly" : ""}`}>
        <label className="room-object-inspector__row">
          <span>Colour tint</span>
          <input
            type="color"
            value={object.colorTintHex ?? "#f4b63f"}
            disabled={!canTouch || busy}
            onChange={(event) => {
              void runAction(() => actions.update(object.id, { colorTintHex: event.target.value }));
            }}
          />
        </label>
      </div>

      <div className={`room-object-inspector__section${!canTouch ? " room-object-inspector__section--readonly" : ""}`}>
        <span className="room-object-inspector__label">Transform</span>
        <p className="room-object-inspector__hint">
          Drag on the floor for x/z placement. Use these controls for height, scale, and full 3D orientation.
        </p>
        <label className="room-object-inspector__row room-object-inspector__row--stacked">
          <span>Height</span>
          <div className="room-object-inspector__control">
            <input
              type="range"
              min={0.2}
              max={3}
              step={0.05}
              value={poseDraft.position.y}
              disabled={!canTouch || busy}
              onChange={(event) =>
                setPoseDraft((current) => ({
                  ...current,
                  position: { ...current.position, y: Number(event.target.value) }
                }))
              }
            />
            <span className="room-object-inspector__value">{poseDraft.position.y.toFixed(2)} m</span>
          </div>
        </label>
        <label className="room-object-inspector__row room-object-inspector__row--stacked">
          <span>Scale</span>
          <div className="room-object-inspector__control">
            <input
              type="range"
              min={minScale}
              max={maxScale}
              step={scaleStep}
              value={scaleDraft}
              disabled={!canTouch || busy}
              onChange={(event) => setScaleDraft(Number(event.target.value))}
            />
            <span className="room-object-inspector__value">{scaleDraft.toFixed(2)}x</span>
          </div>
        </label>
        {([
          ["yaw", "Yaw"],
          ["pitch", "Pitch"],
          ["roll", "Roll"]
        ] as const).map(([axis, label]) => {
          const degrees = (poseDraft.rotation[axis] * 180) / Math.PI;
          return (
            <label key={axis} className="room-object-inspector__row room-object-inspector__row--stacked">
              <span>{label}</span>
              <div className="room-object-inspector__control">
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={5}
                  value={degrees}
                  disabled={!canTouch || busy}
                  onChange={(event) => {
                    const radians = (Number(event.target.value) * Math.PI) / 180;
                    setPoseDraft((current) => ({
                      ...current,
                      rotation: { ...current.rotation, [axis]: radians }
                    }));
                  }}
                />
                <span className="room-object-inspector__value">{Math.round(degrees)}°</span>
              </div>
            </label>
          );
        })}
        {actionError ? <p className="room-object-inspector__error">{actionError}</p> : null}
        <button
          type="button"
          className="hud-btn"
          disabled={!canTouch || busy}
          onClick={() => {
            void runAction(() =>
              actions.update(object.id, {
                pose: poseDraft,
                scale: scaleDraft
              })
            ).catch(() => undefined);
          }}
        >
          Apply transform
        </button>
      </div>

      {isTeacher ? (
        <div className="room-object-inspector__section room-object-inspector__section--teacher">
          <span className="room-object-inspector__label">Touch access</span>
          <p className="room-object-inspector__hint">
            Match board grants: teacher-only, named students/groups, or whole class.
          </p>
          <label className="room-object-inspector__row">
            <span>Policy</span>
            <select
              value={touchPolicyDraft}
              disabled={busy}
              onChange={(event) => setTouchPolicyDraft(event.target.value as RoomObjectTouchPolicy)}
            >
              <option value="teacher-only">Teacher only</option>
              <option value="granted">Granted students / groups</option>
              <option value="all-class">All class</option>
            </select>
          </label>
          {touchPolicyDraft === "granted" ? (
            <>
              <span className="room-object-inspector__sub-label">Students</span>
              <div className="room-object-inspector__checks">
                {students.map((student) => (
                  <label key={student.id} className="room-object-inspector__check">
                    <input
                      type="checkbox"
                      checked={grantUserIds.includes(student.id)}
                      disabled={busy}
                      onChange={(event) => {
                        setGrantUserIds((current) =>
                          event.target.checked
                            ? [...current, student.id]
                            : current.filter((id) => id !== student.id)
                        );
                      }}
                    />
                    <span>{student.displayName}</span>
                  </label>
                ))}
              </div>
              <span className="room-object-inspector__sub-label">Groups</span>
              <div className="room-object-inspector__checks">
                {activeGroups.map((group) => (
                  <label key={group.id} className="room-object-inspector__check">
                    <input
                      type="checkbox"
                      checked={grantGroupIds.includes(group.id)}
                      disabled={busy}
                      onChange={(event) => {
                        setGrantGroupIds((current) =>
                          event.target.checked
                            ? [...current, group.id]
                            : current.filter((id) => id !== group.id)
                        );
                      }}
                    />
                    <span>{group.label}</span>
                  </label>
                ))}
              </div>
            </>
          ) : null}
          <button
            type="button"
            className="hud-btn"
            disabled={busy}
            onClick={() => {
              void runAction(() =>
                actions.setTouch(object.id, touchPolicyDraft, {
                  userIds: touchPolicyDraft === "granted" ? grantUserIds : [],
                  groupIds: touchPolicyDraft === "granted" ? grantGroupIds : []
                })
              );
            }}
          >
            Apply touch policy
          </button>
          <div className="room-object-inspector__actions">
            <button
              type="button"
              className="hud-btn"
              disabled={busy}
              onClick={() => void runAction(() => actions.reset(object.id))}
            >
              Reset
            </button>
            <button
              type="button"
              className="hud-btn room-object-inspector__danger"
              disabled={busy}
              onClick={() => void runAction(() => actions.remove(object.id))}
            >
              Remove
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
