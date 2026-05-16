export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string
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

export function tooManyRequests(message: string) {
  return new HttpError(429, message, "rate_limited");
}
