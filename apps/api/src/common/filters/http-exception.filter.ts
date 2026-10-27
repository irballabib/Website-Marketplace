import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

const DEFAULT_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Permintaan tidak valid',
  [HttpStatus.UNAUTHORIZED]: 'Autentikasi diperlukan',
  [HttpStatus.FORBIDDEN]: 'Akses ditolak',
  [HttpStatus.NOT_FOUND]: 'Data tidak ditemukan',
  [HttpStatus.CONFLICT]: 'Data bertentangan dengan kondisi saat ini',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Data tidak dapat diproses',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Ukuran file terlalu besar',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Terlalu banyak permintaan, coba lagi nanti',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Terjadi kesalahan pada server',
};

/**
 * Normalises every error into `{ code, message, details? }` as required by the
 * API contract. Internal error details are never leaked to clients.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let code = DEFAULT_CODES[status] ?? `HTTP_${status}`;
    let message = DEFAULT_MESSAGES[status] ?? 'Terjadi kesalahan pada server';
    let details: unknown;

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const body = payload as Record<string, unknown>;

        if (typeof body.code === 'string') {
          code = body.code;
        }

        if (Array.isArray(body.message)) {
          message = 'Data permintaan tidak valid';
          details = body.message;
        } else if (typeof body.message === 'string') {
          message = body.message;
        }

        if (body.details !== undefined) {
          details = body.details;
        }
      }
    }

    if (status >= 500) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`${request.method} ${request.originalUrl} failed with ${status}`, stack);
    }

    response.status(status).json({
      code,
      message,
      ...(details === undefined ? {} : { details }),
    });
  }
}
