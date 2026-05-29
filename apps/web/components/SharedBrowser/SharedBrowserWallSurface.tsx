"use client";

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CanvasTexture,
  LinearFilter,
  SRGBColorSpace,
  Vector2,
  type CanvasTexture as CanvasTextureType,
  type Mesh
} from "three";
import type { WallObject } from "@3dspace/contracts";
import { CLIENT_TUNING } from "../../lib/config";
import { useDocumentVisible } from "../../lib/visibility";
import type { SharedBrowserController } from "../../lib/useSharedBrowser";
import { WALL_OBJECT_DISTANCE_FACTOR } from "../../lib/wallObjectSurface";
import { activeSharedBrowserLeaseUserId, SharedBrowserControls } from "./SharedBrowserControls";
import { DEFAULT_SHARED_BROWSER_FRAME_SIZE } from "./hyperbeamFrameCanvas";
import { useHyperbeamEmbed } from "./useHyperbeamEmbed";

const WALL_BROWSER_HTML_Z_INDEX_RANGE: [number, number] = [15, 0];
const VIEWPORT_HEIGHT_RATIO = 0.82;
const CHROME_HEIGHT_RATIO = 0.18;

function forwardPointerToHyperbeam(
  container: HTMLDivElement | null,
  uv: Vector2 | undefined,
  frameWidth: number,
  frameHeight: number,
  nativeEvent: PointerEvent,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel"
) {
  if (!container || !uv) return;
  const rect = container.getBoundingClientRect();
  const clientX = rect.left + uv.x * frameWidth;
  const clientY = rect.top + uv.y * frameHeight;
  const target = container.querySelector("video, iframe") ?? container;
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      button: nativeEvent.button,
      buttons: nativeEvent.buttons,
      pointerId: nativeEvent.pointerId,
      pointerType: nativeEvent.pointerType,
      isPrimary: nativeEvent.isPrimary,
      pressure: nativeEvent.pressure
    })
  );
}

export function SharedBrowserWallSurface({
  object,
  controller,
  currentUserId,
  surfaceWidth,
  surfaceHeight,
  displayAspectRatio,
  embedVisible,
  htmlResolutionScale
}: {
  object: WallObject;
  controller: SharedBrowserController;
  currentUserId?: string;
  surfaceWidth: number;
  surfaceHeight: number;
  displayAspectRatio: number;
  embedVisible: boolean;
  htmlResolutionScale: number;
}) {
  const tabVisible = useDocumentVisible();
  const board = controller.getBoard(object.id);
  const meshRef = useRef<Mesh | null>(null);
  const frameDirtyRef = useRef(false);
  const pointerDownRef = useRef(false);
  const videoMapRef = useRef<CanvasTextureType | null>(null);
  const [videoMap, setVideoMap] = useState<CanvasTextureType | null>(null);

  const leaseUserId = activeSharedBrowserLeaseUserId(board);
  const hasLease = Boolean(currentUserId && leaseUserId === currentUserId);
  const embedUrl = board.session?.hyperbeam?.embedUrl ?? null;
  const embedEnabled =
    board.status === "active" && Boolean(embedUrl) && !board.loading && embedVisible && tabVisible;
  const frameSize = board.session?.viewport ?? DEFAULT_SHARED_BROWSER_FRAME_SIZE;

  const hyperbeam = useHyperbeamEmbed({
    embedUrl,
    enabled: embedEnabled,
    hasControl: hasLease,
    videoMode: "frame",
    frameSize,
    displayAspectRatio,
    playoutDelay: CLIENT_TUNING.sharedBrowserHyperbeamPlayoutDelay,
    onFrameDrawn: () => {
      frameDirtyRef.current = true;
    },
    onDisconnect: (reason) => {
      if (reason === "unauthorized" || reason === "inactive") {
        void controller.refreshEmbed(object.id).catch(() => undefined);
      }
    }
  });

  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const host = document.createElement("div");
    host.className = "shared-browser-hyperbeam-host";
    host.style.position = "fixed";
    host.style.left = "-10000px";
    host.style.top = "0";
    host.style.overflow = "hidden";
    host.style.opacity = "0";
    host.style.pointerEvents = "none";

    const canvas = document.createElement("canvas");
    canvas.className = "shared-browser-viewport__canvas";

    const container = document.createElement("div");
    container.className = "shared-browser-viewport__embed shared-browser-viewport__embed--input-layer";
    container.style.width = "100%";
    container.style.height = "100%";

    const audio = document.createElement("audio");
    audio.className = "shared-browser-viewport__audio";
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");

    host.appendChild(canvas);
    host.appendChild(container);
    host.appendChild(audio);
    document.body.appendChild(host);

    hyperbeam.canvasRef.current = canvas;
    hyperbeam.containerRef.current = container;
    hyperbeam.audioRef.current = audio;

    return () => {
      hyperbeam.canvasRef.current = null;
      hyperbeam.containerRef.current = null;
      hyperbeam.audioRef.current = null;
      host.remove();
    };
  }, [hyperbeam.audioRef, hyperbeam.canvasRef, hyperbeam.containerRef]);

  useLayoutEffect(() => {
    const host = hyperbeam.containerRef.current?.parentElement;
    const canvas = hyperbeam.canvasRef.current;
    if (!host || !canvas) return;
    host.style.width = `${frameSize.width}px`;
    host.style.height = `${frameSize.height}px`;
    canvas.width = frameSize.width;
    canvas.height = frameSize.height;
  }, [frameSize.height, frameSize.width, hyperbeam.canvasRef, hyperbeam.containerRef]);

  useEffect(() => {
    if (!embedEnabled || hyperbeam.status !== "connected") {
      if (videoMapRef.current) {
        videoMapRef.current.dispose();
        videoMapRef.current = null;
        setVideoMap(null);
      }
      return;
    }
    const canvas = hyperbeam.canvasRef.current;
    if (!canvas) return;
    videoMapRef.current?.dispose();
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    videoMapRef.current = texture;
    setVideoMap(texture);
  }, [embedEnabled, frameSize.height, frameSize.width, hyperbeam.status]);

  useEffect(() => {
    return () => {
      videoMapRef.current?.dispose();
      videoMapRef.current = null;
    };
  }, []);

  useFrame(() => {
    if (!videoMap || !frameDirtyRef.current) return;
    videoMap.needsUpdate = true;
    frameDirtyRef.current = false;
  });

  const viewportWidth = surfaceWidth * 0.98;
  const viewportHeight = surfaceHeight * VIEWPORT_HEIGHT_RATIO;
  const meshY = -surfaceHeight * ((1 - VIEWPORT_HEIGHT_RATIO) / 2 + 0.02);
  const chromeY = surfaceHeight * (VIEWPORT_HEIGHT_RATIO / 2 + CHROME_HEIGHT_RATIO / 2 + 0.02);

  const chromeStyle = useMemo(() => {
    const widthPx = ((surfaceWidth * 400) / WALL_OBJECT_DISTANCE_FACTOR) * htmlResolutionScale;
    const heightPx = ((surfaceHeight * CHROME_HEIGHT_RATIO * 400) / WALL_OBJECT_DISTANCE_FACTOR) * htmlResolutionScale;
    return {
      width: `${widthPx}px`,
      height: `${heightPx}px`,
      transform: `scale(${1 / htmlResolutionScale})`,
      transformOrigin: "center center"
    };
  }, [htmlResolutionScale, surfaceHeight, surfaceWidth]);

  const showPlaceholder =
    board.status === "paused" ||
    board.loading ||
    !embedUrl ||
    hyperbeam.status === "loading" ||
    hyperbeam.status === "error" ||
    !videoMap;

  const placeholderLabel =
    board.status === "paused"
      ? "Browser not started"
      : board.loading || hyperbeam.status === "loading"
      ? "Connecting…"
      : hyperbeam.status === "error"
      ? "Connection lost"
      : "Waiting for browser";

  const onPointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!hasLease) return;
    event.stopPropagation();
    pointerDownRef.current = true;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    forwardPointerToHyperbeam(
      hyperbeam.containerRef.current,
      event.uv,
      frameSize.width,
      frameSize.height,
      event.nativeEvent,
      "pointerdown"
    );
  };

  const onPointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!hasLease || !pointerDownRef.current) return;
    event.stopPropagation();
    forwardPointerToHyperbeam(
      hyperbeam.containerRef.current,
      event.uv,
      frameSize.width,
      frameSize.height,
      event.nativeEvent,
      "pointermove"
    );
  };

  const endPointer = (event: ThreeEvent<PointerEvent>) => {
    if (!hasLease || !pointerDownRef.current) return;
    event.stopPropagation();
    pointerDownRef.current = false;
    const target = event.target as Element | null;
    if (target?.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    forwardPointerToHyperbeam(
      hyperbeam.containerRef.current,
      event.uv,
      frameSize.width,
      frameSize.height,
      event.nativeEvent,
      "pointerup"
    );
  };

  return (
    <>
      <Html
        transform
        center
        distanceFactor={WALL_OBJECT_DISTANCE_FACTOR}
        position={[0, chromeY, 0.004]}
        className="wall-object-html shared-browser-wall-html"
        zIndexRange={WALL_BROWSER_HTML_Z_INDEX_RANGE}
        style={chromeStyle}
      >
        <SharedBrowserControls object={object} board={board} controller={controller} {...(currentUserId ? { currentUserId } : {})} compact />
      </Html>
      <mesh
        ref={meshRef}
        position={[0, meshY, 0.002]}
        data-testid="shared-browser-wall-mesh"
        {...(hasLease
          ? {
              onPointerDown,
              onPointerMove,
              onPointerUp: endPointer,
              onPointerCancel: endPointer
            }
          : { raycast: () => null })}
      >
        <planeGeometry args={[viewportWidth, viewportHeight]} />
        <meshBasicMaterial
          map={videoMap}
          color={videoMap ? "#ffffff" : "#0a1112"}
          toneMapped={false}
          transparent={showPlaceholder && Boolean(videoMap)}
          opacity={showPlaceholder && videoMap ? 0.92 : 1}
        />
      </mesh>
      {showPlaceholder ? (
        <Html
          transform
          center
          distanceFactor={WALL_OBJECT_DISTANCE_FACTOR}
          position={[0, meshY, 0.003]}
          zIndexRange={WALL_BROWSER_HTML_Z_INDEX_RANGE}
        >
          <div className="shared-browser-wall-placeholder" data-testid="shared-browser-viewport">
            <strong>{placeholderLabel}</strong>
            {board.error ? <span>{board.error}</span> : null}
            {hyperbeam.error ? <span>{hyperbeam.error}</span> : null}
          </div>
        </Html>
      ) : null}
      {!hasLease && embedEnabled && hyperbeam.status === "connected" && !showPlaceholder ? (
        <Html
          transform
          center
          distanceFactor={WALL_OBJECT_DISTANCE_FACTOR}
          position={[0, meshY - viewportHeight * 0.38, 0.003]}
          zIndexRange={WALL_BROWSER_HTML_Z_INDEX_RANGE}
        >
          <div className="shared-browser-viewport__hint">Take control to interact</div>
        </Html>
      ) : null}
    </>
  );
}
