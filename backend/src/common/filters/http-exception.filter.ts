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

    if (typeof exceptionResponse !== 'object' || exceptionResponse === null) {
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { message, statusCode, error, ...rest } = exceptionResponse as Record<
      string,
      unknown
    >;
    return Object.keys(rest).length > 0 ? rest : undefined;
  }
}
