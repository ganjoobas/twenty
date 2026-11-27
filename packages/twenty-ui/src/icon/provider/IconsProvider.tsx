import { type JSX, useEffect, useState } from 'react';

import { IconsContext } from '@ui/icon/provider/internal/IconsContext';
import { type IconComponent } from '@ui/icon/types/IconComponent';

type IconsProviderProps = {
  children: JSX.Element;
  // WSChat fork: icons the fork adds to the registry by name (WSCHAT.md)
  extraIcons?: Record<string, IconComponent>;
};

export const IconsProvider = ({ children, extraIcons }: IconsProviderProps) => {
  const [icons, setIcons] = useState<Record<string, IconComponent>>({});

  useEffect(() => {
    import('./internal/AllIcons').then(({ ALL_ICONS }) => {
      setIcons({ ...ALL_ICONS, ...extraIcons });
    });
  }, [extraIcons]);

  return (
    <IconsContext.Provider value={icons}>{children}</IconsContext.Provider>
  );
};
