import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { isPlainObject } from 'twenty-shared/utils';
import { type Response } from 'express';

import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { mapUpstreamErrorToBridgeError } from 'src/engine/core-modules/wschat-bridge/utils/map-upstream-error-to-bridge-error.util';
import { buildWschatBridgeErrorBody } from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';

// Controller-scoped: every answer carries a stable `code`, and upstream exceptions never leak as raw 500 messages
@Catch()
export class WschatBridgeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(WschatBridgeExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (response.headersSent) {
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // ValidationPipe / ParseUUIDPipe bodies have no code; guard 401/404 bodies stay exactly as they are
      if (
        status === HttpStatus.BAD_REQUEST &&
        isPlainObject(body) &&
        !('code' in body)
      ) {
        response
          .status(status)
          .json({ ...body, code: WSCHAT_BRIDGE_ERROR_CODES.INVALID_INPUT });

        return;
      }

      response.status(status).json(body);

      return;
    }

    const mappedError = mapUpstreamErrorToBridgeError(exception);

    if (mappedError !== null) {
      response.status(mappedError.statusCode).json(mappedError);

      return;
    }

    this.logger.error(
      `Unexpected error: ${exception instanceof Error ? exception.message : String(exception)}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        buildWschatBridgeErrorBody(
          HttpStatus.INTERNAL_SERVER_ERROR,
          WSCHAT_BRIDGE_ERROR_CODES.INTERNAL_ERROR,
          'Internal error',
        ),
      );
  }
}
