"use client";

import { Html } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, LinearFilter, MeshBasicMaterial, SRGBColorSpace, type Mesh } from "three";
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

function eventPointToFrame(
  clientX: number,
  clientY: number,
  bounds: DOMRect
) {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const x = Math.min(Math.max((clientX - bounds.left) / bounds.width, 0), 1);
  const y = Math.min(Math.max((clientY - bounds.top) / bounds.height, 0), 1);
  return {
    x,
    y
  };
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
  const textureRef = useRef<CanvasTexture | null>(null);
  const materialRef = useRef<MeshBasicMaterial | null>(null);
  const interactionOverlayRef = useRef<HTMLDivElement | null>(null);
  const hasFrameRef = useRef(false);
  const pointerDownRef = useRef(false);
  const [hasFrame, setHasFrame] = useState(false);
  const invalidate = useThree((state) => state.invalidate);
  // Tracks whether we've sent the auto-navigate for the current embed session.
  const autoNavigatedForEmbedRef = useRef<string | null>(null);

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
    // Hyperbeam blits each decoded frame into our off-screen canvas (via the hook's
    // canvasRef). Flag the CanvasTexture for re-upload so the wall mesh repaints.
    onFrameDrawn: () => {
      const texture = textureRef.current;
      if (texture) texture.needsUpdate = true;
      invalidate();
      if (!hasFrameRef.current) {
        hasFrameRef.current = true;
        setHasFrame(true);
        // Sample the first frame's average color to confirm real content vs blank VM.
        const canvas = hyperbeam.canvasRef.current;
        if (canvas) {
          try {
            const ctx = canvas.getContext("2d");
            if (ctx) {
              const d = ctx.getImageData(0, 0, Math.min(80, canvas.width), Math.min(45, canvas.height)).data;
              let r = 0, g = 0, b = 0;
              for (let i = 0; i < d.length; i += 4) { r += d[i] ?? 0; g += d[i+1] ?? 0; b += d[i+2] ?? 0; }
              const n = d.length / 4;
              console.log(`[SharedBrowser] first frame received — avgRGB=[${Math.round(r/n)},${Math.round(g/n)},${Math.round(b/n)}] canvas=${canvas.width}x${canvas.height}`);
            }
          } catch (e) {
            console.log("[SharedBrowser] first frame received — pixel sample failed:", e);
          }
        }
      }
    },
    onDisconnect: (reason) => {
      if (reason === "unauthorized" || reason === "inactive") {
        void controller.refreshEmbed(object.id).catch(() => undefined);
        return;
      }
      if (reason === "request" && embedEnabled && board.status === "active") {
        console.warn("[SharedBrowser] unexpected request disconnect while wall is live; refreshing embed");
        void controller
          .refreshEmbed(object.id)
          .catch(() => controller.resume(object.id))
          .catch(() => undefined);
      }
    }
  });

  // When the embed first connects and the board has a stored URL, navigate to it.
  // This restores the page after a session restart/resume that produces a blank browser.
  useEffect(() => {
    if (hyperbeam.status !== "connected") return;
    if (!board.currentUrl || board.status !== "active") return;
    if (autoNavigatedForEmbedRef.current === embedUrl) return;
    autoNavigatedForEmbedRef.current = embedUrl;
    console.log("[SharedBrowser] auto-navigate on playback ready", { url: board.currentUrl, embedUrl, status: hyperbeam.status });
    void controller.navigate(object.id, board.currentUrl)
      .then(() => console.log("[SharedBrowser] auto-navigate succeeded"))
      .catch((err: unknown) => console.error("[SharedBrowser] auto-navigate failed", err));
  }, [hyperbeam.status, board.currentUrl, board.status, embedUrl, controller, object.id]);

  // The wall texture still comes from an off-screen canvas, but the live Hyperbeam container
  // now sits in an Html overlay sized to the board surface so native pointer input lands on
  // Hyperbeam itself instead of the scene canvas camera controller.
  useLayoutEffect(() => {
    if (typeof document === "undefined") return;
    const host = document.createElement("div");
    host.className = "shared-browser-hyperbeam-host";

    const canvas = document.createElement("canvas");
    canvas.width = frameSize.width;
    canvas.height = frameSize.height;

    const audio = document.createElement("audio");
    audio.className = "shared-browser-viewport__audio";
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");

    host.appendChild(audio);
    document.body.appendChild(host);

    hyperbeam.canvasRef.current = canvas;
    hyperbeam.audioRef.current = audio;

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    textureRef.current = texture;

    return () => {
      texture.dispose();
      textureRef.current = null;
      hyperbeam.canvasRef.current = null;
      hyperbeam.audioRef.current = null;
      host.remove();
    };
    // Canvas/audio host is created once; frameSize only seeds the initial canvas size — the
    // embed hook resizes the canvas per-frame, so we must not recreate the host.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hyperbeam.audioRef, hyperbeam.canvasRef]);

  // Reset the "has a painted frame" gate whenever the embed leaves the connected state,
  // so the dark placeholder shows again instead of a stale frame.
  useEffect(() => {
    if (hyperbeam.status === "connected") return;
    hasFrameRef.current = false;
    setHasFrame(false);
  }, [hyperbeam.status]);

  useEffect(() => {
    const material = materialRef.current;
    if (!material) return;
    material.map = hasFrame ? textureRef.current : null;
    material.needsUpdate = true;
    invalidate();
  }, [hasFrame, invalidate]);

  useEffect(() => {
    const overlay = interactionOverlayRef.current;
    const hb = hyperbeam.instance;
    if (!overlay || !hb || !hasLease) return;

    const onWheel = (event: WheelEvent) => {
      hb.sendEvent({ type: "wheel", deltaY: event.deltaY });
      event.preventDefault();
      event.stopPropagation();
    };

    overlay.addEventListener("wheel", onWheel, { passive: false });
    return () => overlay.removeEventListener("wheel", onWheel);
  }, [hasLease, hyperbeam.instance]);

  const viewportWidth = surfaceWidth * 0.985;
  const viewportHeight = surfaceHeight * VIEWPORT_HEIGHT_RATIO;
  const meshY = -surfaceHeight * ((1 - VIEWPORT_HEIGHT_RATIO) / 2 + 0.01);
  const chromeY = surfaceHeight * (VIEWPORT_HEIGHT_RATIO / 2 + CHROME_HEIGHT_RATIO / 2 + 0.005);

  // Size goes on the drei <Html> group; the resolution-scale compensation goes on a
  // child mount (matching every other wall board). Putting a transform directly in the
  // Html style clobbers drei's own transform and collapses the toolbar layout.
  const chromeStyle = useMemo(() => {
    const widthPx = ((surfaceWidth * 400) / WALL_OBJECT_DISTANCE_FACTOR) * htmlResolutionScale;
    const heightPx = ((surfaceHeight * CHROME_HEIGHT_RATIO * 400) / WALL_OBJECT_DISTANCE_FACTOR) * htmlResolutionScale;
    return {
      width: `${widthPx}px`,
      height: `${heightPx}px`
    };
  }, [htmlResolutionScale, surfaceHeight, surfaceWidth]);

  const chromeMountStyle = useMemo(
    () => ({
      transform: `scale(${1 / htmlResolutionScale})`,
      transformOrigin: "center center" as const
    }),
    [htmlResolutionScale]
  );
  const viewportStyle = useMemo<CSSProperties>(() => {
    const widthPx = (viewportWidth * 400) / WALL_OBJECT_DISTANCE_FACTOR;
    const heightPx = (viewportHeight * 400) / WALL_OBJECT_DISTANCE_FACTOR;
    return {
      width: `${widthPx}px`,
      height: `${heightPx}px`,
      pointerEvents: "auto",
      overflow: "hidden"
    };
  }, [viewportHeight, viewportWidth]);

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

  const onViewportPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasLease) return;
    const point = eventPointToFrame(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect()
    );
    if (!point || !hyperbeam.instance) return;
    pointerDownRef.current = true;
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    hyperbeam.instance.sendEvent({ type: "mousemove", x: point.x, y: point.y });
    hyperbeam.instance.sendEvent({ type: "mousedown", x: point.x, y: point.y, button: event.button });
    event.preventDefault();
    event.stopPropagation();
  };

  const onViewportPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasLease || !hyperbeam.instance) return;
    const point = eventPointToFrame(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect()
    );
    if (!point) return;
    hyperbeam.instance.sendEvent({ type: "mousemove", x: point.x, y: point.y });
    event.preventDefault();
    event.stopPropagation();
  };

  const endViewportPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!hasLease || !hyperbeam.instance) return;
    const point = eventPointToFrame(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect()
    );
    pointerDownRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (point) {
      hyperbeam.instance.sendEvent({ type: "mouseup", x: point.x, y: point.y, button: event.button });
    }
    event.preventDefault();
    event.stopPropagation();
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
        <div className="wall-object-surface-mount" style={chromeMountStyle}>
          <SharedBrowserControls
            object={object}
            board={board}
            controller={controller}
            {...(currentUserId ? { currentUserId } : {})}
            compact
          />
        </div>
      </Html>
      <mesh
        ref={meshRef}
        position={[0, meshY, 0.004]}
        data-testid="shared-browser-wall-mesh"
        raycast={() => null}
      >
        <planeGeometry args={[viewportWidth, viewportHeight]} />
        <meshBasicMaterial
          ref={materialRef}
          map={null}
          color={hasFrame ? "#ffffff" : "#0b1418"}
          toneMapped={false}
        />
      </mesh>
      <Html
        transform
        center
        distanceFactor={WALL_OBJECT_DISTANCE_FACTOR}
        position={[0, meshY, 0.0055]}
        className="wall-object-html shared-browser-wall-html"
        zIndexRange={WALL_BROWSER_HTML_Z_INDEX_RANGE}
        style={viewportStyle}
      >
        <div className="wall-object-surface-mount" style={{ position: "relative", width: "100%", height: "100%" }}>
          <div
            ref={hyperbeam.containerRef}
            className="shared-browser-viewport__embed shared-browser-viewport__embed--input-layer"
            aria-label="Shared browser interaction layer"
            role="application"
            style={{
              width: "100%",
              height: "100%",
              pointerEvents: "none",
              touchAction: "pan-x pan-y",
              background: "transparent",
              overflow: "hidden"
            }}
          />
          <div
            aria-label="Shared browser event overlay"
            role="application"
            ref={interactionOverlayRef}
            tabIndex={hasLease ? 0 : -1}
            onPointerDown={onViewportPointerDown}
            onPointerMove={onViewportPointerMove}
            onPointerUp={endViewportPointer}
            onPointerCancel={endViewportPointer}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: hasLease ? "auto" : "none",
              touchAction: "none",
              cursor: hasLease ? "default" : "auto",
              background: "transparent",
              zIndex: 2
            }}
          />
        </div>
      </Html>
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
