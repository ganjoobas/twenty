import { type WorkspaceAuthContext } from 'src/engine/core-modules/auth/types/workspace-auth-context.type';
import { type TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { WschatWorkspaceMemberFindManyPreQueryHook } from 'src/engine/core-modules/wschat-bridge/query-hooks/wschat-workspace-member-find-many.pre-query.hook';
import {
  excludeWschatServiceMemberFromFilter,
  isWschatServiceMemberEmail,
} from 'src/engine/core-modules/wschat-bridge/utils/exclude-wschat-service-member.util';

const SERVICE_EMAIL = 'crm-service@wschat.org';

const EXCLUSION = {
  or: [{ userEmail: { neq: SERVICE_EMAIL } }, { userEmail: { is: 'NULL' } }],
};

describe('excludeWschatServiceMemberFromFilter', () => {
  it('adds the exclusion to a workspaceMember filter, keeping the original one', () => {
    const filter = { name: { firstName: { ilike: '%an%' } } };

    expect(
      excludeWschatServiceMemberFromFilter(
        'workspaceMember',
        filter,
        ` ${SERVICE_EMAIL.toUpperCase()} `,
      ),
    ).toEqual({ and: [filter, EXCLUSION] });
  });

  it('works with an empty filter', () => {
    expect(
      excludeWschatServiceMemberFromFilter(
        'workspaceMember',
        {},
        SERVICE_EMAIL,
      ),
    ).toEqual({ and: [EXCLUSION] });
  });

  it('leaves other objects and an unconfigured installation alone', () => {
    const filter = { id: { eq: 'x' } };

    expect(
      excludeWschatServiceMemberFromFilter('person', filter, SERVICE_EMAIL),
    ).toBe(filter);
    expect(
      excludeWschatServiceMemberFromFilter('workspaceMember', filter, ''),
    ).toBe(filter);
    expect(
      excludeWschatServiceMemberFromFilter(
        'workspaceMember',
        filter,
        undefined,
      ),
    ).toBe(filter);
  });
});

describe('isWschatServiceMemberEmail', () => {
  it('matches the service email regardless of case and spaces', () => {
    expect(
      isWschatServiceMemberEmail('CRM-Service@wschat.org', SERVICE_EMAIL),
    ).toBe(true);
    expect(isWschatServiceMemberEmail('anna@example.com', SERVICE_EMAIL)).toBe(
      false,
    );
    expect(isWschatServiceMemberEmail(SERVICE_EMAIL, undefined)).toBe(false);
    expect(isWschatServiceMemberEmail(null, SERVICE_EMAIL)).toBe(false);
  });
});

describe('WschatWorkspaceMemberFindManyPreQueryHook', () => {
  const hook = new WschatWorkspaceMemberFindManyPreQueryHook({
    get: () => SERVICE_EMAIL,
  } as unknown as TwentyConfigService);

  it('hides the service member from people in the app', async () => {
    const result = await hook.execute(
      { type: 'user' } as WorkspaceAuthContext,
      'workspaceMember',
      { first: 10 },
    );

    expect(result).toEqual({ first: 10, filter: { and: [EXCLUSION] } });
  });

  it('keeps the full list for API keys (WSChat maps emails to members with it)', async () => {
    const payload = { first: 10 };

    expect(
      await hook.execute(
        { type: 'apiKey' } as WorkspaceAuthContext,
        'workspaceMember',
        payload,
      ),
    ).toBe(payload);
  });
});
