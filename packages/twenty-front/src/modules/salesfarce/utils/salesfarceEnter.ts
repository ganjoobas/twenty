import { SALESFARCE_SESSION_STORAGE_KEY } from '@/salesfarce/constants/SalesfarceSessionStorageKey';
import { reloadWindow } from '~/utils/reloadWindow';
// WSChat fork: Salesfarce stays on until another theme is picked
import { wschatSetSalesfarcePinned } from '@/wschat/utils/wschatSalesfarcePin';

export const salesfarceEnter = () => {
  try {
    sessionStorage.setItem(SALESFARCE_SESSION_STORAGE_KEY, 'true');
  } catch {
    return;
  }

  // WSChat fork: pin the choice
  wschatSetSalesfarcePinned(true);
  reloadWindow();
};
