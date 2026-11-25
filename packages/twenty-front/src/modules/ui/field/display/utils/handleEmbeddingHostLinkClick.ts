import { type MouseEvent } from 'react';

import {
  type EmbeddingHostWindow,
  postLinkToEmbeddingHost,
} from '@/ui/field/display/utils/postLinkToEmbeddingHost';

type EmbeddingHostLinkClickEvent = Pick<
  MouseEvent,
  | 'button'
  | 'ctrlKey'
  | 'metaKey'
  | 'shiftKey'
  | 'altKey'
  | 'defaultPrevented'
  | 'preventDefault'
>;

type HandleEmbeddingHostLinkClickArgs = {
  url: string;
  event: EmbeddingHostLinkClickEvent;
  currentWindow?: EmbeddingHostWindow;
};

// Modified and non-primary clicks keep meaning "open in a new tab"
export const handleEmbeddingHostLinkClick = ({
  url,
  event,
  currentWindow,
}: HandleEmbeddingHostLinkClickArgs): boolean => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    event.altKey ||
    !postLinkToEmbeddingHost({ url, currentWindow })
  ) {
    return false;
  }

  event.preventDefault();

  return true;
};
