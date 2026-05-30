import type { FastifyRequest } from "fastify";
import { z, type ZodTypeAny } from "zod";

export function parseBody<T extends ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> {
  return schema.parse(request.body ?? {});
}

export function parseParams<T extends ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> {
  return schema.parse(request.params ?? {});
}

export function parseQuery<T extends ZodTypeAny>(schema: T, request: FastifyRequest): z.infer<T> {
  return schema.parse(request.query ?? {});
}
