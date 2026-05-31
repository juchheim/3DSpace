export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}

export function badRequest(message: string) {
  return new HttpError(400, message, "bad_request");
}

export function unauthorized(message = "Authentication required") {
  return new HttpError(401, message, "unauthorized");
}

export function forbidden(message = "Not authorized for this action") {
  return new HttpError(403, message, "forbidden");
}

export function notFound(message = "Resource not found") {
  return new HttpError(404, message, "not_found");
}

export function conflict(message: string) {
  return new HttpError(409, message, "conflict");
}

export function unprocessableEntity(message: string) {
  return new HttpError(422, message, "unprocessable_entity");
}

export function exitTicketIncomplete(details: {
  stepId: string;
  missingUserIds: string[];
  submittedCount: number;
  expectedCount: number;
}) {
  return new HttpError(
    409,
    `${details.missingUserIds.length} student(s) have not submitted the exit ticket.`,
    "exit-ticket-incomplete",
    details as Record<string, unknown>
  );
}

export function tooManyRequests(message: string) {
  return new HttpError(429, message, "rate_limited");
}

export function notImplemented(message: string) {
  return new HttpError(501, message, "not_implemented");
}

export function roomObjectDisabled() {
  return new HttpError(404, "Room objects are disabled for this room", "room-object-disabled");
}

export function worldSkinsDisabled() {
  return new HttpError(404, "World skins are disabled", "world-skins-disabled");
}

export function roomObjectLimitReached() {
  return new HttpError(422, "Active room object limit reached", "room-object-limit-reached");
}

export function roomObjectNotFound() {
  return new HttpError(404, "Room object not found", "room-object-not-found");
}

export function roomObjectTouchDenied() {
  return new HttpError(403, "You do not have permission to manipulate this object", "room-object-touch-denied");
}

export function roomObjectLocked() {
  return new HttpError(409, "This object is locked in place", "room-object-locked");
}

export function roomObjectTemplateInvalid(message: string, details?: Record<string, unknown>) {
  return new HttpError(422, message, "room-object-template-invalid", details);
}

export function roomObjectUploadTooLarge(details: { maxUploadSizeBytes: number; fileSizeBytes: number }) {
  return new HttpError(422, "Uploaded .glb exceeds the room upload size limit", "room-object-upload-too-large", details);
}

export function roomObjectUploadRejected(message: string, details?: Record<string, unknown>) {
  return new HttpError(422, message, "room-object-upload-rejected", details);
}

export function buildDisabled() {
  return new HttpError(404, "World building is disabled for this room", "build-disabled");
}

export function buildRejected(reason: string) {
  return new HttpError(422, `Build placement rejected: ${reason}`, "build-rejected", { reason });
}

export function buildCapExceeded(scope: "room" | "user") {
  return new HttpError(
    422,
    scope === "room" ? "Build piece limit reached for this room" : "Build piece limit reached for this user",
    "build-cap-exceeded",
    { scope }
  );
}

export function buildDestroyDenied() {
  return new HttpError(403, "You do not have permission to remove this build piece", "build-destroy-denied");
}

export function buildNotFound() {
  return new HttpError(404, "Build piece not found", "build-not-found");
}

export function buildWallHasBoards() {
  return new HttpError(409, "Remove the board before destroying this wall.", "build-wall-has-boards");
}

export function logicDisabled() {
  return new HttpError(404, "Logic is disabled for this room", "logic-disabled");
}

export function logicRejected(reason: string) {
  return new HttpError(422, `Logic placement rejected: ${reason}`, "logic-rejected", { reason });
}

export function logicCapExceeded(scope: "room" | "user") {
  return new HttpError(
    422,
    scope === "room" ? "Logic piece limit reached for this room" : "Logic piece limit reached for this user",
    "logic-cap-exceeded",
    { scope }
  );
}

export function logicDestroyDenied() {
  return new HttpError(403, "You do not have permission to remove this logic piece", "logic-destroy-denied");
}

export function logicNotFound() {
  return new HttpError(404, "Logic piece not found", "logic-not-found");
}

export function escapeSessionAlreadyRunning() {
  return new HttpError(409, "An escape session is already running", "escape-session-already-running");
}

export function escapeSessionNotRunning() {
  return new HttpError(422, "No escape session is running", "escape-session-not-running");
}

export function logicTeleporterDisarmed() {
  return new HttpError(422, "Teleporter pad is not armed", "logic-teleporter-disarmed");
}

export function logicTeleporterNoTarget() {
  return new HttpError(422, "No paired teleporter found for this linkId", "logic-teleporter-no-target");
}
