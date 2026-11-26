import { salesfarceConsumeRequest } from '@/salesfarce/utils/salesfarceConsumeRequest';
// WSChat fork: Salesfarce stays on until another theme is picked
import { wschatIsSalesfarcePinned } from '@/wschat/utils/wschatSalesfarcePin';
import { createAtomState } from '@/ui/utilities/state/jotai/utils/createAtomState';

export const salesfarceIsActiveState = createAtomState<boolean>({
  key: 'salesfarceIsActiveState',
  defaultValue: salesfarceConsumeRequest() || wschatIsSalesfarcePinned(),
});
