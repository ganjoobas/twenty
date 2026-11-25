import { HttpStatus } from '@nestjs/common';

import {
  AuthException,
  AuthExceptionCode,
} from 'src/engine/core-modules/auth/auth.exception';
import {
  WorkspaceException,
  WorkspaceExceptionCode,
} from 'src/engine/core-modules/workspace/workspace.exception';
import { WSCHAT_BRIDGE_ERROR_CODES } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-error-codes.constant';
import { isSchemaBusyError } from 'src/engine/core-modules/wschat-bridge/utils/schema-busy-retry.util';
import {
  buildWschatBridgeErrorBody,
  type WschatBridgeErrorBody,
} from 'src/engine/core-modules/wschat-bridge/utils/wschat-bridge-http-exception.util';
import {
  PermissionsException,
  PermissionsExceptionCode,
} from 'src/engine/permissions/permissions.exception';
import { CustomException } from 'src/utils/custom-exception';

// BillingExceptionCode lives in an enterprise-licensed file, so its one relevant code is matched as a string
const BILLING_SEAT_LIMIT_REACHED_CODE = 'BILLING_SEAT_LIMIT_REACHED';

// AuthException uses one FORBIDDEN code for several refusals; their messages are the only discriminator
const WORKSPACE_LIMIT_MESSAGE_PREFIX = 'Cannot create more than';
const WORKSPACE_CREATION_RESTRICTED_MESSAGE =
  'Workspace creation is restricted to admins';
const SEAT_LIMIT_MESSAGE_PREFIX = 'This workspace has used all its seats';

const mapAuthException = (
  error: AuthException,
): WschatBridgeErrorBody | null => {
  if (error.code === AuthExceptionCode.SIGNUP_DISABLED) {
    return buildWschatBridgeErrorBody(
      HttpStatus.CONFLICT,
      WSCHAT_BRIDGE_ERROR_CODES.MULTIWORKSPACE_DISABLED,
      'This server does not allow creating another workspace (IS_MULTIWORKSPACE_ENABLED is off)',
    );
  }

  if (error.code !== AuthExceptionCode.FORBIDDEN_EXCEPTION) {
    return null;
  }

  if (error.message.startsWith(WORKSPACE_LIMIT_MESSAGE_PREFIX)) {
    return buildWschatBridgeErrorBody(
      HttpStatus.CONFLICT,
      WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_LIMIT_REACHED,
      error.message,
    );
  }

  if (error.message === WORKSPACE_CREATION_RESTRICTED_MESSAGE) {
    return buildWschatBridgeErrorBody(
      HttpStatus.FORBIDDEN,
      WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_CREATION_RESTRICTED,
      error.message,
    );
  }

  if (error.message.startsWith(SEAT_LIMIT_MESSAGE_PREFIX)) {
    return buildWschatBridgeErrorBody(
      HttpStatus.CONFLICT,
      WSCHAT_BRIDGE_ERROR_CODES.SEAT_LIMIT_REACHED,
      error.message,
    );
  }

  return null;
};

const mapWorkspaceException = (
  error: WorkspaceException,
): WschatBridgeErrorBody | null => {
  switch (error.code) {
    case WorkspaceExceptionCode.SUBDOMAIN_NOT_VALID:
      return buildWschatBridgeErrorBody(
        HttpStatus.BAD_REQUEST,
        WSCHAT_BRIDGE_ERROR_CODES.SUBDOMAIN_INVALID,
        error.message,
      );
    case WorkspaceExceptionCode.SUBDOMAIN_ALREADY_TAKEN:
      return buildWschatBridgeErrorBody(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.SUBDOMAIN_TAKEN,
        error.message,
      );
    case WorkspaceExceptionCode.IFRAME_ORIGIN_LIMIT_EXCEEDED:
      return buildWschatBridgeErrorBody(
        HttpStatus.BAD_REQUEST,
        WSCHAT_BRIDGE_ERROR_CODES.TOO_MANY_EMBEDDING_ORIGINS,
        error.message,
      );
    case WorkspaceExceptionCode.WORKSPACE_NOT_FOUND:
      return buildWschatBridgeErrorBody(
        HttpStatus.NOT_FOUND,
        WSCHAT_BRIDGE_ERROR_CODES.WORKSPACE_NOT_FOUND,
        error.message,
      );
    default:
      return null;
  }
};

const mapPermissionsException = (
  error: PermissionsException,
): WschatBridgeErrorBody | null => {
  switch (error.code) {
    case PermissionsExceptionCode.CANNOT_UNASSIGN_LAST_ADMIN:
    case PermissionsExceptionCode.CANNOT_DELETE_LAST_ADMIN_USER:
      return buildWschatBridgeErrorBody(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.LAST_ADMIN,
        'The workspace must keep at least one Admin',
      );
    case PermissionsExceptionCode.CANNOT_DELETE_LAST_SERVER_ADMIN:
      return buildWschatBridgeErrorBody(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.LAST_SERVER_ADMIN,
        'This user is the last server admin of the instance and has no other workspace',
      );
    case PermissionsExceptionCode.ROLE_NOT_FOUND:
    case PermissionsExceptionCode.DEFAULT_ROLE_NOT_FOUND:
      return buildWschatBridgeErrorBody(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.ROLE_NOT_FOUND,
        error.message,
      );
    case PermissionsExceptionCode.ROLE_CANNOT_BE_ASSIGNED_TO_USERS:
    case PermissionsExceptionCode.CUSTOM_ROLES_NOT_ENTITLED:
      return buildWschatBridgeErrorBody(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.ROLE_NOT_ASSIGNABLE,
        error.message,
      );
    case PermissionsExceptionCode.NO_ROLE_FOUND_FOR_USER_WORKSPACE:
      return buildWschatBridgeErrorBody(
        HttpStatus.CONFLICT,
        WSCHAT_BRIDGE_ERROR_CODES.MEMBER_ROLE_MISSING,
        error.message,
      );
    default:
      return null;
  }
};

// null means "not a known refusal": the caller answers 500 and logs the original
export const mapUpstreamErrorToBridgeError = (
  error: unknown,
): WschatBridgeErrorBody | null => {
  if (error instanceof AuthException) {
    return mapAuthException(error);
  }

  if (error instanceof WorkspaceException) {
    return mapWorkspaceException(error);
  }

  if (error instanceof PermissionsException) {
    return mapPermissionsException(error);
  }

  if (isSchemaBusyError(error)) {
    return buildWschatBridgeErrorBody(
      HttpStatus.CONFLICT,
      WSCHAT_BRIDGE_ERROR_CODES.SCHEMA_BUSY,
      'The workspace is still building indexes from an earlier change; repeat the call in a minute',
    );
  }

  if (
    error instanceof CustomException &&
    error.code === BILLING_SEAT_LIMIT_REACHED_CODE
  ) {
    return buildWschatBridgeErrorBody(
      HttpStatus.CONFLICT,
      WSCHAT_BRIDGE_ERROR_CODES.SEAT_LIMIT_REACHED,
      error.message,
    );
  }

  return null;
};
