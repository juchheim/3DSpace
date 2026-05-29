import type { Buffer } from "node:buffer";

type StoredFrame = { jpeg: Buffer; updatedAt: number };

/**
 * In-memory store of the latest screencast JPEG per session. Used only by the
 * dev `GET .../frame.jpg` fallback when LiveKit is unavailable — production
 * always renders the LiveKit video track (see config `requiredInProduction`).
 */
export class JpegFrameStore {
  private readonly frames = new Map<string, StoredFrame>();

  set(sessionId: string, jpeg: Buffer): void {
    this.frames.set(sessionId, { jpeg, updatedAt: Date.now() });
  }

  get(sessionId: string): StoredFrame | undefined {
    return this.frames.get(sessionId);
  }

  delete(sessionId: string): void {
    this.frames.delete(sessionId);
  }

  clear(): void {
    this.frames.clear();
  }
}
