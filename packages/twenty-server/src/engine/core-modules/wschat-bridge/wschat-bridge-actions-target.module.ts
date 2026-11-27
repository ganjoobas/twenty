import { Module } from '@nestjs/common';

import { KeyValuePairModule } from 'src/engine/core-modules/key-value-pair/key-value-pair.module';
import { WschatBridgeActionsTargetService } from 'src/engine/core-modules/wschat-bridge/services/wschat-bridge-actions-target.service';

// Apart from WschatBridgeModule: the workflow HTTP step needs only this, not the whole bridge
@Module({
  imports: [KeyValuePairModule],
  providers: [WschatBridgeActionsTargetService],
  exports: [WschatBridgeActionsTargetService],
})
export class WschatBridgeActionsTargetModule {}
