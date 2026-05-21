"use client";

import { useState } from "react";
import { getRoomInvite } from "../lib/api";
import type { ApiIdentity } from "../lib/identity";
import { copyInviteText, inviteJoinUrl } from "../lib/invite";

type CopyRoomInviteButtonProps = {
  identity: ApiIdentity;
  roomId: string;
  target?: "code" | "link";
  className?: string;
  disabled?: boolean;
};

export function CopyRoomInviteButton({
  identity,
  roomId,
  target = "code",
  className,
  disabled
}: CopyRoomInviteButtonProps) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    setBusy(true);
    try {
      const invite = await getRoomInvite(identity, roomId);
      const text = target === "code" ? invite.code : inviteJoinUrl(roomId, invite.code);
      await copyInviteText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      window.alert("Unable to copy invite. Try again or create a new room invite from the lobby.");
    } finally {
      setBusy(false);
    }
  }

  const label =
    copied
      ? "Copied!"
      : busy
        ? "…"
        : target === "code"
          ? "Copy invite"
          : "Copy link";

  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      title={target === "code" ? "Copy student invite code" : "Copy student join link"}
      onClick={() => void onCopy()}
    >
      {label}
    </button>
  );
}
