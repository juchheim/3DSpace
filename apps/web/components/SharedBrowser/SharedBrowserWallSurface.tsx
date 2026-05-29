"use client";

import { Html } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LinearFilter,
  SRGBColorSpace,
  Vector2,
  VideoTexture,
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
const VIEWPORT_HEIGHT_RATIO = 0.84;
const CHROME_HEIGHT_RATIO = 0.16;

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
  // UV origin is bottom-left; DOM origin is top-left, so flip Y.
  const clientY = rect.top + (1 - uv.y) * frameHeight;
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
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const textureRef = useRef<VideoTexture | null>(null);
  const pointerDownRef = useRef(false);
  const hasFrameRef = useRef(false);
  const [hasFrame, setHasFrame] = useState(false);

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
    captureVideoTrack: true,
    frameSize,
    displayAspectRatio,
    playoutDelay: CLIENT_TUNING.sharedBrowserHyperbeamPlayoutDelay,
    onDisconnect: (reason) => {
      if (reason === "unauthorized" || reason === "inactive") {
        void controller.refreshEmbed(object.id).catch(() => undefined);
      }
    }
  });

  // Build the off-screen Hyperbeam host imperatively so no DOM nodes live in the R3F tree.
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const host = document.createElement("div");
    host.className = "shared-browser-hyperbeam-host";

    const container = document.createElement("div");
    container.className = "shared-browser-viewport__embed shared-browser-viewport__embed--input-layer";
    container.style.width = "100%";
    container.style.height = "100%";

    const video = document.createElement("video");
    video.muted = true;
    video.autoplay = true;
    video.setAttribute("playsinline", "");
    video.style.width = "100%";
    video.style.height = "100%";

    const audio = document.createElement("audio");
    audio.className = "shared-browser-viewport__audio";
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");

    host.appendChild(container);
    host.appendChild(video);
    host.appendChild(audio);
    document.body.appendChild(host);

    hyperbeam.containerRef.current = container;
    hyperbeam.audioRef.current = audio;
    videoElRef.current = video;

    const texture = new VideoTexture(video);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    textureRef.current = texture;

    return () => {
      texture.dispose();
      textureRef.current = null;
      hyperbeam.containerRef.current = null;
      hyperbeam.audioRef.current = null;
      videoElRef.current = null;
      video.srcObject = null;
      host.remove();
    };
  }, [hyperbeam.audioRef, hyperbeam.containerRef]);

  useLayoutEffect(() => {
    const host = hyperbeam.containerRef.current?.parentElement;
    if (host) {
      host.style.width = `${frameSize.width}px`;
      host.style.height = `${frameSize.height}px`;
    }
  }, [frameSize.height, frameSize.width, hyperbeam.containerRef]);

  // Feed the live video track into the off-screen <video> that backs the texture.
  useEffect(() => {
    const video = videoElRef.current;
    if (!video) return;
    const track = hyperbeam.videoTrack;
    if (!track) {
      video.srcObject = null;
      hasFrameRef.current = false;
      setHasFrame(false);
      return;
    }
    video.srcObject = new MediaStream([track]);
    void video.play().catch(() => undefined);
  }, [hyperbeam.videoTrack]);

  useFrame(() => {
    const video = videoElRef.current;
    const texture = textureRef.current;
    if (!video || !texture) return;
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    texture.needsUpdate = true;
    if (!hasFrameRef.current) {
      hasFrameRef.current = true;
      setHasFrame(true);
    }
  });

  const viewportWidth = surfaceWidth * 0.985;
  const viewportHeight = surfaceHeight * VIEWPORT_HEIGHT_RATIO;
  const meshY = -surfaceHeight * ((1 - VIEWPORT_HEIGHT_RATIO) / 2 + 0.01);
  const chromeY = surfaceHeight * (VIEWPORT_HEIGHT_RATIO / 2 + CHROME_HEIGHT_RATIO / 2 + 0.005);

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
    !hasFrame;

  const placeholderLabel =
    board.status === "paused"
      ? "Browser paused"
      : hyperbeam.status === "error"
      ? "Connection lost"
      : "Loading browser…";

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
        position={[0, chromeY, 0.006]}
        className="wall-object-html shared-browser-wall-html"
        zIndexRange={WALL_BROWSER_HTML_Z_INDEX_RANGE}
        style={chromeStyle}
      >
        <SharedBrowserControls
          object={object}
          board={board}
          controller={controller}
          {...(currentUserId ? { currentUserId } : {})}
          compact
        />
      </Html>
      <mesh
        ref={meshRef}
        position={[0, meshY, 0.004]}
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
          map={hasFrame ? textureRef.current : null}
          color={hasFrame ? "#ffffff" : "#0b1418"}
          toneMapped={false}
        />
      </mesh>
      {showPlaceholder ? (
        <Html
          transform
          center
          distanceFactor={WALL_OBJECT_DISTANCE_FACTOR}
          position={[0, meshY, 0.005]}
          zIndexRange={WALL_BROWSER_HTML_Z_INDEX_RANGE}
        >
          <div className="shared-browser-wall-placeholder" data-testid="shared-browser-viewport">
            <span className="shared-browser-wall-placeholder__spinner" aria-hidden />
            <strong>{placeholderLabel}</strong>
            {board.error ? <span>{board.error}</span> : null}
            {hyperbeam.error ? <span>{hyperbeam.error}</span> : null}
          </div>
        </Html>
      ) : null}
    </>
  );
}
