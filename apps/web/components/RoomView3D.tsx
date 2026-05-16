"use client";

import { Canvas } from "@react-three/fiber";
import { Billboard, Html, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import type { QualityLevel, RoomManifest, WallAnchorSchema, WallPlaneSchema } from "@3dspace/contracts";
import type { z } from "zod";
import type { ParticipantView } from "./RoomClient";

type Wall = z.infer<typeof WallPlaneSchema>;
type Anchor = z.infer<typeof WallAnchorSchema>;

export function RoomView3D({
  manifest,
  participants,
  localParticipantId: _localParticipantId,
  quality,
  onMoveToPoint
}: {
  manifest: RoomManifest;
  participants: ParticipantView[];
  localParticipantId: string;
  quality: QualityLevel;
  onMoveToPoint(point: { x: number; z: number }): void;
}) {
  const dpr = quality === "high" ? 1.8 : quality === "medium" ? 1.4 : 1;

  return (
    <div className="canvas-wrap">
      <Canvas camera={{ position: [0, 9.5, 10.5], fov: 48 }} dpr={dpr} gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}>
        <color attach="background" args={["#16231d"]} />
        <ambientLight intensity={0.82} />
        <directionalLight position={[4, 8, 6]} intensity={1.4} />
        <RoomGeometry manifest={manifest} onMoveToPoint={onMoveToPoint} />
        {participants.map((participant) => (
          <Avatar key={participant.id} participant={participant} />
        ))}
        <OrbitControls target={[0, 0, 0]} enablePan={false} maxPolarAngle={Math.PI / 2.15} minDistance={6} maxDistance={18} />
      </Canvas>
    </div>
  );
}

function RoomGeometry({ manifest, onMoveToPoint }: { manifest: RoomManifest; onMoveToPoint(point: { x: number; z: number }): void }) {
  return (
    <group>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.02, 0]}
        receiveShadow
        onClick={(event) => {
          event.stopPropagation();
          onMoveToPoint({ x: event.point.x, z: event.point.z });
        }}
      >
        <planeGeometry args={[manifest.dimensions.width, manifest.dimensions.depth]} />
        <meshStandardMaterial color="#d8c99f" roughness={0.92} />
      </mesh>
      <gridHelper args={[18, 18, "#4c6b58", "#31473b"]} position={[0, 0.01, 0]} />
      {manifest.walls.map((wall) => <WallMesh key={wall.id} wall={wall} />)}
      {manifest.wallAnchors.map((anchor) => <AnchorMesh key={anchor.id} anchor={anchor} />)}
      {manifest.spawnPoints.map((spawn) => (
        <mesh key={spawn.id} position={[spawn.position.x, 0.03, spawn.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.22, 0.3, 24]} />
          <meshBasicMaterial color="#eb5e28" transparent opacity={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function WallMesh({ wall }: { wall: Wall }) {
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
  const midpoint = [(wall.start.x + wall.end.x) / 2, wall.height / 2, (wall.start.z + wall.end.z) / 2] as const;
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x);

  return (
    <mesh position={midpoint} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, wall.height, 0.12]} />
      <meshStandardMaterial color="#8ea487" roughness={0.85} />
    </mesh>
  );
}

function AnchorMesh({ anchor }: { anchor: Anchor }) {
  const rotation = useMemo<[number, number, number]>(() => {
    if (Math.abs(anchor.normal.x) > 0) return [0, anchor.normal.x > 0 ? Math.PI / 2 : -Math.PI / 2, 0];
    return [0, anchor.normal.z < 0 ? Math.PI : 0, 0];
  }, [anchor.normal.x, anchor.normal.z]);

  return (
    <mesh position={[anchor.position.x, anchor.position.y, anchor.position.z]} rotation={rotation}>
      <planeGeometry args={[anchor.width, anchor.height]} />
      <meshStandardMaterial color="#263b31" emissive="#111c17" roughness={0.6} />
      <Html center transform distanceFactor={8}>
        <div className="avatar-label">{anchor.label}</div>
      </Html>
    </mesh>
  );
}

function Avatar({ participant }: { participant: ParticipantView }) {
  const position = participant.state.position;
  const color = participant.local ? "#eb5e28" : "#2f6b4f";

  return (
    <group position={[position.x, 0, position.z]} rotation={[0, participant.state.rotation.y, 0]}>
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.22, 0.58, 4, 10]} />
        <meshStandardMaterial color={color} roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <sphereGeometry args={[0.24, 18, 12]} />
        <meshStandardMaterial color="#fffaf0" roughness={0.42} />
      </mesh>
      <Billboard position={[0, 1.72, 0]}>
        <Html center distanceFactor={8}>
          <div className="avatar-label">
            {participant.displayName}
            <br />
            {participant.state.media?.speaking ? "speaking" : participant.state.media?.microphoneEnabled ? "mic on" : "mic off"}
          </div>
        </Html>
      </Billboard>
      {participant.state.media?.cameraEnabled ? (
        <Billboard position={[0.9, 1.36, 0]}>
          <Html center distanceFactor={7}>
            <AvatarVideoCard stream={participant.cameraStream ?? null} label={participant.local ? "Your camera" : `${participant.displayName} camera`} />
          </Html>
        </Billboard>
      ) : null}
    </group>
  );
}

function AvatarVideoCard({ stream, label }: { stream: MediaStream | null; label: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="avatar-video-card">
      {stream ? <video ref={videoRef} autoPlay muted playsInline /> : null}
      <div style={{ padding: "0.35rem 0.45rem" }}>{label}</div>
    </div>
  );
}
