import type { Buffer } from "node:buffer";
import {
  LocalVideoTrack,
  Room,
  TrackPublishOptions,
  TrackSource,
  VideoBufferType,
  VideoFrame,
  VideoSource
} from "@livekit/rtc-node";
import sharp from "sharp";
import type { Role } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { mintLiveKitToken } from "../services/livekit.js";

export type SharedBrowserPublisherOptions = {
  config: AppConfig;
  roomId: string;
  wallObjectId: string;
  width: number;
  height: number;
};

/**
 * Publishes a session's screencast as a synthetic LiveKit video track. The bot
 * joins the room as `shared-browser:<wallObjectId>`; participants subscribe to
 * that identity to render the board. JPEG frames from the driver are decoded +
 * resized to the track resolution and pushed as RGBA `VideoFrame`s.
 */
export class SharedBrowserLiveKitPublisher {
  private readonly room = new Room();
  private readonly source: VideoSource;
  private readonly track: LocalVideoTrack;
  private readonly options: SharedBrowserPublisherOptions;
  readonly participantIdentity: string;
  private publishing = false;
  private encoding = false;
  private trackSid: string | undefined;

  constructor(options: SharedBrowserPublisherOptions) {
    this.options = options;
    this.participantIdentity = `shared-browser:${options.wallObjectId}`;
    this.source = new VideoSource(options.width, options.height);
    this.track = LocalVideoTrack.createVideoTrack("shared-browser", this.source);
  }

  /** Join the room and publish the (empty) video track. Returns the track SID. */
  async start(): Promise<{ participantIdentity: string; trackSid: string | undefined }> {
    const token = await mintLiveKitToken(this.options.config, {
      roomId: this.options.roomId,
      participantIdentity: this.participantIdentity,
      displayName: "Shared Browser",
      role: "teacher" as Role
    });
    await this.room.connect(this.options.config.livekitUrl, token, { autoSubscribe: false, dynacast: true });
    const publishOptions = new TrackPublishOptions();
    publishOptions.source = TrackSource.SOURCE_SCREENSHARE;
    const publication = await this.room.localParticipant!.publishTrack(this.track, publishOptions);
    this.publishing = true;
    this.trackSid = publication.sid;
    return { participantIdentity: this.participantIdentity, trackSid: this.trackSid };
  }

  /** Decode one screencast JPEG and capture it as a video frame. */
  async pushJpeg(jpeg: Buffer): Promise<void> {
    if (!this.publishing || this.encoding) return; // drop frames while a decode is in flight
    this.encoding = true;
    try {
      const { data, info } = await sharp(jpeg)
        .resize(this.options.width, this.options.height, { fit: "fill", kernel: "lanczos3" })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const frame = new VideoFrame(new Uint8Array(data), info.width, info.height, VideoBufferType.RGBA);
      this.source.captureFrame(frame);
    } catch {
      // Skip undecodable / transient frames rather than tearing down the track.
    } finally {
      this.encoding = false;
    }
  }

  async close(): Promise<void> {
    this.publishing = false;
    try {
      if (this.trackSid && this.room.localParticipant) {
        await this.room.localParticipant.unpublishTrack(this.trackSid).catch(() => undefined);
      }
      await this.source.close().catch(() => undefined);
      await this.room.disconnect();
    } catch {
      // best-effort teardown
    }
  }
}
