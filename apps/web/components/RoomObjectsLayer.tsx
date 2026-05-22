"use client";

import { useEffect, useMemo } from "react";
import type { AvatarAppearance, ClassroomGroup, Role, RoomManifest, RoomObject, RoomObjectTemplate } from "@3dspace/contracts";
import { canGrabRoomObject, snapPosition, snapScale, snapYaw } from "../lib/roomObjectInteraction";
import { RoomObjectMesh } from "./RoomObjectMesh";
import type { ParticipantView } from "./RoomClient";

type GrabInfo = { holderUserId: string; expiresAt: string };

type RoomObjectActions = {
  beginGrab(objectId: string): Promise<boolean>;
  publishPose(objectId: string, pose: import("@3dspace/contracts").Pose, scale: number): void;
  endGrab(objectId: string, finalPose: import("@3dspace/contracts").Pose, finalScale: number): Promise<void>;
  update(objectId: string, patch: { colorTintHex?: string }): Promise<unknown>;
  remove(objectId: string): Promise<void>;
  reset(objectId: string): Promise<unknown>;
  setTouch(
    objectId: string,
    touchPolicy: import("@3dspace/contracts").RoomObjectTouchPolicy,
    grants?: { userIds?: string[]; groupIds?: string[] }
  ): Promise<unknown>;
  setParameters(objectId: string, parameters: Record<string, unknown>): void;
};

export function RoomObjectsLayer({
  manifest,
  objects,
  templatesById,
  grabs,
  myActiveGrabObjectId,
  role,
  currentUserId,
  memberGroupIds,
  participants,
  classroomGroups,
  getAppearance,
  selectedObjectId,
  onSelectObject,
  actions
}: {
  manifest: RoomManifest;
  objects: RoomObject[];
  templatesById: Record<string, RoomObjectTemplate>;
  grabs: Map<string, GrabInfo>;
  myActiveGrabObjectId: string | null;
  role: Role;
  currentUserId: string;
  memberGroupIds: string[];
  participants: ParticipantView[];
  classroomGroups: ClassroomGroup[];
  getAppearance: (participantId: string) => AvatarAppearance;
  selectedObjectId: string | null;
  onSelectObject(objectId: string | null): void;
  actions: RoomObjectActions;
}) {
  const selectedObject = useMemo(
    () => objects.find((object) => object.id === selectedObjectId) ?? null,
    [objects, selectedObjectId]
  );
  const selectedTemplate = selectedObject ? templatesById[selectedObject.templateId] : undefined;

  useEffect(() => {
    if (!selectedObject || !selectedTemplate) return;
    const activeObject = selectedObject;
    const activeTemplate = selectedTemplate;

    const canGrab = canGrabRoomObject({
      object: activeObject,
      userId: currentUserId,
      role,
      memberGroupIds
    });
    if (!canGrab) return;

    const isHolder = myActiveGrabObjectId === activeObject.id;

    async function ensureGrab() {
      if (isHolder) return true;
      return actions.beginGrab(activeObject.id);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLElement && event.target.closest(".room-object-html")) return;
      const bypass = event.shiftKey;
      const step = 0.25;
      const scaleStep = activeTemplate.defaultScale * 0.05;

      const mutate = async (nextPose: typeof activeObject.pose, nextScale: number) => {
        const pose = {
          position: snapPosition(manifest, nextPose.position, bypass),
          rotation: {
            ...nextPose.rotation,
            yaw: snapYaw(nextPose.rotation.yaw, bypass)
          }
        };
        const scale = snapScale(nextScale, activeTemplate.defaultScale, bypass);
        actions.publishPose(activeObject.id, pose, scale);
        await actions.endGrab(activeObject.id, pose, scale);
      };

      void (async () => {
        const grabbed = await ensureGrab();
        if (!grabbed) return;

        if (event.key === "ArrowLeft") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              position: { ...activeObject.pose.position, x: activeObject.pose.position.x - step }
            },
            activeObject.scale
          );
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              position: { ...activeObject.pose.position, x: activeObject.pose.position.x + step }
            },
            activeObject.scale
          );
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              position: { ...activeObject.pose.position, z: activeObject.pose.position.z - step }
            },
            activeObject.scale
          );
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              position: { ...activeObject.pose.position, z: activeObject.pose.position.z + step }
            },
            activeObject.scale
          );
        } else if (event.key === "[") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              rotation: {
                ...activeObject.pose.rotation,
                yaw: activeObject.pose.rotation.yaw - Math.PI / 12
              }
            },
            activeObject.scale
          );
        } else if (event.key === "]") {
          event.preventDefault();
          await mutate(
            {
              ...activeObject.pose,
              rotation: {
                ...activeObject.pose.rotation,
                yaw: activeObject.pose.rotation.yaw + Math.PI / 12
              }
            },
            activeObject.scale
          );
        } else if (event.key === "+" || event.key === "=") {
          event.preventDefault();
          await mutate(activeObject.pose, activeObject.scale + scaleStep);
        } else if (event.key === "-" || event.key === "_") {
          event.preventDefault();
          await mutate(activeObject.pose, activeObject.scale - scaleStep);
        }
      })();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    actions,
    classroomGroups,
    currentUserId,
    manifest,
    memberGroupIds,
    myActiveGrabObjectId,
    participants,
    role,
    selectedObject,
    selectedTemplate
  ]);

  return (
    <group>
      {objects.map((object) => {
        const template = templatesById[object.templateId];
        if (!template) return null;
        const grab = grabs.get(object.id);
        const holderId = grab?.holderUserId;
        const holderParticipant = holderId
          ? participants.find((participant) => participant.id === holderId)
          : undefined;
        const grabHolderColor = holderParticipant
          ? getAppearance(holderParticipant.id).shirtFront
          : "#f4b63f";

        return (
          <RoomObjectMesh
            key={object.id}
            manifest={manifest}
            object={object}
            template={template}
            canGrab={canGrabRoomObject({ object, userId: currentUserId, role, memberGroupIds })}
            isGrabbed={Boolean(grab)}
            grabHolderColor={grabHolderColor}
            localIsHolder={holderId === currentUserId}
            selected={selectedObjectId === object.id}
            actions={actions}
            onSelect={() => onSelectObject(object.id)}
          />
        );
      })}
    </group>
  );
}
