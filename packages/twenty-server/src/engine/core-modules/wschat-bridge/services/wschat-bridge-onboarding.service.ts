import { Injectable } from '@nestjs/common';

import { OnboardingService } from 'src/engine/core-modules/onboarding/onboarding.service';

@Injectable()
export class WschatBridgeOnboardingService {
  constructor(private readonly onboardingService: OnboardingService) {}

  // Clears every pending step through the service's own setters, so getOnboardingStatus answers COMPLETED (billing off).
  // The plain setters are used instead of the complete*/skip* transitions: those push "go back" history and, for
  // connect-account, grant onboarding credits, neither of which applies to a member provisioned by WSChat
  async completeAllSteps({
    userId,
    workspaceId,
  }: {
    userId: string;
    workspaceId: string;
  }): Promise<void> {
    await this.onboardingService.setOnboardingConnectAccountPending({
      userId,
      workspaceId,
      value: false,
    });

    await this.onboardingService.setOnboardingCreateProfilePending({
      userId,
      workspaceId,
      value: false,
    });

    await this.onboardingService.setOnboardingBookCallPending({
      userId,
      workspaceId,
      value: false,
    });

    // Without userId the delete matches the workspace-level flag set at sign-up and any per-user copy
    await this.onboardingService.setOnboardingInviteTeamPending({
      workspaceId,
      value: false,
    });
  }
}
