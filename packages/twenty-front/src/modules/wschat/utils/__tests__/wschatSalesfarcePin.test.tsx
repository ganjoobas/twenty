import { act, renderHook } from '@testing-library/react';
import { Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import { ToastProvider } from 'twenty-ui/components/feedback';

import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { salesfarceEnter } from '@/salesfarce/utils/salesfarceEnter';
import {
  jotaiStore,
  resetJotaiStore,
} from '@/ui/utilities/state/jotai/jotaiStore';
import {
  wschatIsSalesfarcePinned,
  wschatSetSalesfarcePinned,
} from '@/wschat/utils/wschatSalesfarcePin';
import { useColorScheme } from '@/workspace-member/hooks/useColorScheme';

const updateSettings = jest.fn().mockResolvedValue(undefined);

jest.mock('@/workspace-member/hooks/useUpdateWorkspaceMemberSettings', () => ({
  useUpdateWorkspaceMemberSettings: () => ({
    updateWorkspaceMemberSettings: updateSettings,
  }),
}));

jest.mock('~/utils/reloadWindow', () => ({
  reloadWindow: jest.fn(),
}));

const Wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider store={jotaiStore}>
    <ToastProvider>{children}</ToastProvider>
  </JotaiProvider>
);

describe('wschatSalesfarcePin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetJotaiStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should keep Salesfarce pinned after it is picked', () => {
    expect(wschatIsSalesfarcePinned()).toBe(false);

    salesfarceEnter();

    expect(wschatIsSalesfarcePinned()).toBe(true);
    expect(wschatIsSalesfarcePinned()).toBe(true);
  });

  it('should unpin Salesfarce once another theme is saved', async () => {
    wschatSetSalesfarcePinned(true);
    jotaiStore.set(currentWorkspaceMemberState.atom, {
      id: 'appearance-member',
      name: { firstName: 'Alex', lastName: 'Example' },
      userEmail: 'alex@example.com',
      locale: 'en',
      colorScheme: 'Light',
    });

    const { result } = renderHook(() => useColorScheme(), {
      wrapper: Wrapper,
    });

    await act(() => result.current.setColorScheme('Dark'));

    expect(updateSettings).toHaveBeenCalledTimes(1);
    expect(wschatIsSalesfarcePinned()).toBe(false);
  });

  it('should not pin without storage', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => wschatSetSalesfarcePinned(true)).not.toThrow();
    expect(wschatIsSalesfarcePinned()).toBe(false);
  });
});
