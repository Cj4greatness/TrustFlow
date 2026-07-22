import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponseBody {
  success: false;
  message: string | string[];
  statusCode: number;
  timestamp: string;
  path: string;
  details?: unknown;
}

/**
 * Normalizes every error thrown anywhere in the application into the
 * consistent JSON shape specified by the CTO:
 * { success, message, statusCode, timestamp, path }.
 *
 * Applied globally in main.ts so no controller needs to think about
 * error formatting individually.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const statusCode = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!isHttpException) {
      // Unexpected errors are logged with full detail server-side,
      // but never leaked to the client response.
      this.logger.error(
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ErrorResponseBody = {
      success: false,
      message: this.extractMessage(exception, isHttpException),
      statusCode,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // If the exception carried a structured object (like our health
    // check's { status, service, dependencies }), surface it under
    // `details` rather than discarding it — useful for debugging
    // without breaking the standard { success, message, ... } shape.
    const extraDetails = this.extractDetails(exception, isHttpException);
    if (extraDetails) {
      body.details = extraDetails;
    }

    response.status(statusCode).json(body);
  }

  private extractMessage(
    exception: unknown,
    isHttpException: boolean,
  ): string | string[] {
    if (!isHttpException) {
      return 'An unexpected error occurred';
    }

    const exceptionResponse = (exception as HttpException).getResponse();

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      return (exceptionResponse as { message: string | string[] }).message;
    }

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    // The exception response was a plain object with no `message`
    // key (e.g. our health check's { status, service, dependencies }).
    // Fall back to a generic message; the object itself is still
    // surfaced separately via `details`.
    return 'An error occurred';
  }

  private extractDetails(
    exception: unknown,
    isHttpException: boolean,
  ): unknown {
    if (!isHttpException) {
      return undefined;
    }

    const exceptionResponse = (exception as HttpException).getResponse();

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      !('message' in exceptionResponse)
    ) {
      return exceptionResponse;
    }

    return undefined;
  }
}
