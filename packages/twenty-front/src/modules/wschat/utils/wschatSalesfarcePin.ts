const WSCHAT_SALESFARCE_LOCAL_STORAGE_KEY = 'wschat-salesfarce';

// Upstream keeps Salesfarce for one reload only; here it stays until another theme is picked, see WSCHAT.md.
// Storage may be blocked (frame, private mode): then the theme is simply not pinned.
export const wschatIsSalesfarcePinned = (): boolean => {
  try {
    return localStorage.getItem(WSCHAT_SALESFARCE_LOCAL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

export const wschatSetSalesfarcePinned = (isPinned: boolean) => {
  try {
    if (isPinned) {
      localStorage.setItem(WSCHAT_SALESFARCE_LOCAL_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(WSCHAT_SALESFARCE_LOCAL_STORAGE_KEY);
    }
  } catch {
    return;
  }
};
