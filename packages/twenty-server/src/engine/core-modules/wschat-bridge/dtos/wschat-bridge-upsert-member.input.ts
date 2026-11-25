import { IsIn } from 'class-validator';

import {
  WSCHAT_BRIDGE_MEMBER_ROLES,
  type WschatBridgeMemberRole,
} from 'src/engine/core-modules/wschat-bridge/constants/wschat-bridge-member-roles.constant';
import { WschatBridgeMemberProfileInput } from 'src/engine/core-modules/wschat-bridge/dtos/wschat-bridge-member-profile.input';

export class WschatBridgeUpsertMemberInput extends WschatBridgeMemberProfileInput {
  @IsIn([...WSCHAT_BRIDGE_MEMBER_ROLES], {
    message: `role must be one of: ${WSCHAT_BRIDGE_MEMBER_ROLES.join(', ')}`,
  })
  role: WschatBridgeMemberRole;
}
