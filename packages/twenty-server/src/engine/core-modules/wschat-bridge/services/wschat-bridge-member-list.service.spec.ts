import { MEMBER_ROLE_UNIVERSAL_IDENTIFIER } from 'twenty-shared/constants';

import { WschatBridgeMemberListService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-member-list.service';
import { WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE } from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-managed-roles.constant';
import { STANDARD_ROLE } from 'src/engine/workspace-manager/twenty-standard-application/constants/standard-role.constant';

const SERVICE_EMAIL = 'crm-service@wschat.org';

describe('WschatBridgeMemberListService', () => {
  const service = new WschatBridgeMemberListService(
    {
      find: jest.fn(async () => [
        {
          id: 'uw-1',
          user: { email: 'Boss@Acme.kg', canAccessFullAdminPanel: false },
        },
        {
          id: 'uw-2',
          user: { email: 'op@acme.kg', canAccessFullAdminPanel: false },
        },
        {
          id: 'uw-3',
          user: { email: 'old@acme.kg', canAccessFullAdminPanel: true },
        },
        {
          id: 'uw-4',
          user: { email: SERVICE_EMAIL, canAccessFullAdminPanel: false },
        },
        { id: 'uw-5', user: null },
      ]),
    } as never,
    {
      findRolesByUserWorkspaceIds: jest.fn(
        async () =>
          new Map([
            [
              'uw-1',
              [
                {
                  universalIdentifier:
                    WSCHAT_BRIDGE_COMPANY_ADMIN_ROLE.universalIdentifier,
                  label: 'x',
                },
              ],
            ],
            [
              'uw-2',
              [
                {
                  universalIdentifier: MEMBER_ROLE_UNIVERSAL_IDENTIFIER,
                  label: 'Member',
                },
              ],
            ],
            ['uw-3', [{ universalIdentifier: 'custom', label: 'Sales' }]],
            [
              'uw-4',
              [
                {
                  universalIdentifier: STANDARD_ROLE.admin.universalIdentifier,
                  label: 'Admin',
                },
              ],
            ],
          ]),
      ),
    } as never,
    { isServiceUserEmail: (email: string) => email === SERVICE_EMAIL } as never,
    { findOrThrow: jest.fn(async (id: string) => ({ id })) } as never,
  );

  it('should list every current member with role, service and server admin flags', async () => {
    await expect(service.listAllMembers('ws')).resolves.toEqual({
      members: [
        {
          email: 'boss@acme.kg',
          role: 'admin',
          service: false,
          serverAdmin: false,
        },
        {
          email: 'op@acme.kg',
          role: 'member',
          service: false,
          serverAdmin: false,
        },
        {
          email: 'old@acme.kg',
          role: 'other',
          service: false,
          serverAdmin: true,
        },
        {
          email: SERVICE_EMAIL,
          role: 'admin',
          service: true,
          serverAdmin: false,
        },
      ],
    });
  });
});
