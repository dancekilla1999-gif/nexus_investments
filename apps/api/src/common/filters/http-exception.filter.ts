import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Every error response follows one stable shape — see docs/04-api-architecture.md §8.
 * Never leaks a raw stack trace or internal message to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    // pino-http (see logger.module.ts) assigns req.id — reuse it so a single request has one
    // correlation id across access logs, application logs, and the error body.
    const requestId =
      (request as Request & { id?: string }).id ??
      (request.headers['x-request-id'] as string) ??
      randomUUID();

    const mapped = mapException(exception);

    if (mapped.status >= 500) {
      this.logger.error(
        `[${requestId}] Unhandled exception: ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
    }

    response.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message, requestId, details: mapped.details },
    });
  }
}

interface MappedException {
  status: number;
  code: string;
  message: string;
  details?: unknown;
}

function mapException(exception: unknown): MappedException {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const body = exception.getResponse();
    if (typeof body === 'string') {
      return { status, code: defaultCodeForStatus(status), message: body };
    }
    if (typeof body === 'object' && body !== null) {
      const b = body as Record<string, unknown>;
      return {
        status,
        code: (b.code as string) ?? defaultCodeForStatus(status),
        message: (b.message as string) ?? 'Request failed.',
        details: b.details ?? (Array.isArray(b.message) ? b.message : undefined),
      };
    }
    return { status, code: defaultCodeForStatus(status), message: 'Request failed.' };
  }

  // Prisma errors are an implementation detail — never forwarded verbatim to the client, but
  // mapped to the same stable error contract as everything else (docs/04 §8).
  if (exception instanceof Prisma.PrismaClientKnownRequestError) {
    switch (exception.code) {
      case 'P2002': {
        const target = (exception.meta?.target as string[] | undefined)?.join(', ');
        return {
          status: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: target ? `A record with this ${target} already exists.` : 'Duplicate record.',
        };
      }
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, code: 'NOT_FOUND', message: 'Record not found.' };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          code: 'BAD_REQUEST',
          message: 'This action references a record that does not exist.',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong. Please try again.',
        };
    }
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
  };
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return 'BAD_REQUEST';
    case HttpStatus.UNAUTHORIZED:
      return 'UNAUTHORIZED';
    case HttpStatus.FORBIDDEN:
      return 'FORBIDDEN';
    case HttpStatus.NOT_FOUND:
      return 'NOT_FOUND';
    case HttpStatus.CONFLICT:
      return 'CONFLICT';
    case HttpStatus.TOO_MANY_REQUESTS:
      return 'RATE_LIMITED';
    default:
      return 'INTERNAL_ERROR';
  }
}
