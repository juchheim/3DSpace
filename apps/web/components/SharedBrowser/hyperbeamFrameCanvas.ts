/** Draw a Hyperbeam frame into a 2D canvas (ImageBitmap or video element). */
export function drawHyperbeamFrame(
  ctx: CanvasRenderingContext2D,
  frame: ImageBitmap | HTMLVideoElement,
  width: number,
  height: number
) {
  ctx.clearRect(0, 0, width, height);
  if (frame instanceof HTMLVideoElement) {
    if (frame.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      ctx.drawImage(frame, 0, 0, width, height);
    }
    return;
  }
  ctx.drawImage(frame, 0, 0, width, height);
  frame.close();
}

export const DEFAULT_SHARED_BROWSER_FRAME_SIZE = { width: 1280, height: 720 };
