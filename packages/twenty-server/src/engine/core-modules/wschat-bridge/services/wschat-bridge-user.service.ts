import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { SOURCE_LOCALE } from 'twenty-shared/translations';
import { isDefined } from 'twenty-shared/utils';
import { QueryFailedError, Repository } from 'typeorm';

import { type QueryFailedErrorWithCode } from 'src/engine/api/graphql/workspace-query-runner/utils/workspace-query-runner-graphql-api-exception-handler.util';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { type WschatBridgeMemberProfileInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member-profile.input';
import { maskEmail } from 'src/engine/core-modules/wschat-bridge/utils/mask-email.util';
import { normalizeBridgeEmail } from 'src/engine/core-modules/wschat-bridge/utils/normalize-bridge-email.util';
import { POSTGRESQL_ERROR_CODES } from 'src/engine/workspace-query-executor/constants/postgres-error-codes.constants';

@Injectable()
export class WschatBridgeUserService {
  private readonly logger = new Logger(WschatBridgeUserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly userService: UserService,
  ) {}

  // One person can belong to several workspaces, so an existing core.user is always reused
  async findOrCreate(
    profile: Pick<
      WschatBridgeMemberProfileInput,
      'email' | 'firstName' | 'lastName' | 'locale'
    >,
  ): Promise<{ user: UserEntity; created: boolean }> {
    const email = normalizeBridgeEmail(profile.email);
    const existingUser = await this.userService.findUserByEmail(email);

    if (isDefined(existingUser)) {
      return { user: existingUser, created: false };
    }

    // Shaped like an SSO sign-up (computePartialUserFromUserPayload without a password provider): no passwordHash at
    // all, so no password can ever be used; never a server admin, whatever the instance's admin count
    const userToCreate = this.userRepository.create({
      email,
      firstName: profile.firstName.trim(),
      lastName: profile.lastName.trim(),
      locale: profile.locale ?? SOURCE_LOCALE,
      isEmailVerified: true,
      canImpersonate: false,
      canAccessFullAdminPanel: false,
    });

    try {
      const user = await this.userRepository.save(userToCreate);

      this.logger.log(`Created user ${maskEmail(email)}`);

      return { user, created: true };
    } catch (error) {
      // A concurrent bridge call created the same person first: reuse that row
      const isUniqueViolation =
        error instanceof QueryFailedError &&
        (error as QueryFailedErrorWithCode).code ===
          POSTGRESQL_ERROR_CODES.UNIQUE_VIOLATION;

      const concurrentUser = isUniqueViolation
        ? await this.userService.findUserByEmail(email)
        : null;

      if (!isDefined(concurrentUser)) {
        throw error;
      }

      return { user: concurrentUser, created: false };
    }
  }

  // WSChat vouches for the address, as a personal invitation does in signInUpWithPersonalInvitation
  async markEmailVerified(user: UserEntity): Promise<void> {
    if (user.isEmailVerified) {
      return;
    }

    await this.userService.markEmailAsVerified(user.id);
  }
}
