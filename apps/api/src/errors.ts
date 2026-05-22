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

export function roomObjectLimitReached() {
  return new HttpError(422, "Active room object limit reached", "room-object-limit-reached");
}

export function roomObjectNotFound() {
  return new HttpError(404, "Room object not found", "room-object-not-found");
}

export function roomObjectTouchDenied() {
  return new HttpError(403, "You do not have permission to manipulate this object", "room-object-touch-denied");
}
