import { type IconComponent } from 'twenty-ui/icon';

import { IconWschat } from '@/wschat/components/IconWschat';

// Added to Twenty's icon registry by name; the server's WSCHAT_BRIDGE_ICON stores the same name on fields
export const WSCHAT_ICONS: Record<string, IconComponent> = { IconWschat };
