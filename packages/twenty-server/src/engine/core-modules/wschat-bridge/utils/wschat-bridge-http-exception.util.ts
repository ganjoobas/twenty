import { HttpException, HttpStatus } from '@nestjs/common';

import { type WschatBridgeErrorCode } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';

export type WschatBridgeErrorStatus =
  | HttpStatus.BAD_REQUEST
  | HttpStatus.FORBIDDEN
  | HttpStatus.NOT_FOUND
  | HttpStatus.CONFLICT
  | HttpStatus.INTERNAL_SERVER_ERROR;

const ERROR_NAME_BY_STATUS: Record<WschatBridgeErrorStatus, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
};

export type WschatBridgeErrorBody = {
  statusCode: WschatBridgeErrorStatus;
  error: string;
  message: string;
  code: WschatBridgeErrorCode;
};

export const buildWschatBridgeErrorBody = (
  statusCode: WschatBridgeErrorStatus,
  code: WschatBridgeErrorCode,
  message: string,
): WschatBridgeErrorBody => ({
  statusCode,
  error: ERROR_NAME_BY_STATUS[statusCode],
  message,
  code,
});

// The JSON body is exactly what the caller receives: Nest and the app-level filter render getResponse() as is
export const wschatBridgeHttpException = (
  statusCode: WschatBridgeErrorStatus,
  code: WschatBridgeErrorCode,
  message: string,
) =>
  new HttpException(
    buildWschatBridgeErrorBody(statusCode, code, message),
    statusCode,
  );
