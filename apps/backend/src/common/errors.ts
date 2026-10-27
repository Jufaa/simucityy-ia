import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'Route not found.',
        requestId: request.id,
      },
    });
  });
  app.setErrorHandler((error, request, reply) => {
    const frameworkStatusCode =
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    let statusCode = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred.';
    if (error instanceof ApiError) {
      ({ statusCode, code, message } = error);
    } else if (error instanceof ZodError) {
      statusCode = 400;
      code = 'VALIDATION_ERROR';
      message = 'Request does not match the expected schema.';
    } else if (frameworkStatusCode === 413) {
      statusCode = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Request body exceeds the 64 KiB limit.';
    } else if (
      frameworkStatusCode &&
      frameworkStatusCode >= 400 &&
      frameworkStatusCode < 500
    ) {
      statusCode = frameworkStatusCode;
      code = 'BAD_REQUEST';
      message = 'Request could not be processed.';
    }
    if (statusCode >= 500 && statusCode !== 501) {
      // Log correlation and classification, not arbitrary error payloads or secrets.
      request.log.error({ code, requestId: request.id }, 'Request failed');
    }
    return reply
      .code(statusCode)
      .send({ error: { code, message, requestId: request.id } });
  });
}
