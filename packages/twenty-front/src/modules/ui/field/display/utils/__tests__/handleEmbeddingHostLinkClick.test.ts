import { handleEmbeddingHostLinkClick } from '@/ui/field/display/utils/handleEmbeddingHostLinkClick';
import { postLinkToEmbeddingHost } from '@/ui/field/display/utils/postLinkToEmbeddingHost';

const HOST_ORIGIN = 'https://wschat.org';
const DIALOG_URL = `${HOST_ORIGIN}/workspace/conversations?conversation=42`;

const buildWindow = ({
  isEmbedded = true,
  ancestorOrigins,
  referrer = '',
}: {
  isEmbedded?: boolean;
  ancestorOrigins?: string[];
  referrer?: string;
} = {}) => {
  const top = {};
  const postMessage = jest.fn();

  return {
    postMessage,
    currentWindow: {
      self: isEmbedded ? {} : top,
      top,
      location: { origin: 'https://taxi555.wschat.org', ancestorOrigins },
      document: { referrer },
      parent: { postMessage },
    },
  };
};

const buildEvent = (
  overrides: Partial<{
    button: number;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
  }> = {},
) => ({
  button: 0,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  defaultPrevented: false,
  preventDefault: jest.fn(),
  ...overrides,
});

describe('handleEmbeddingHostLinkClick', () => {
  it('should hand a link to the embedding host to that host only', () => {
    const { currentWindow, postMessage } = buildWindow({
      ancestorOrigins: [HOST_ORIGIN],
    });
    const event = buildEvent();

    const isHandled = handleEmbeddingHostLinkClick({
      url: DIALOG_URL,
      event,
      currentWindow,
    });

    expect(isHandled).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'wschat:open-link', url: DIALOG_URL },
      HOST_ORIGIN,
    );
  });

  it('should use the referrer origin when ancestorOrigins is missing', () => {
    const { currentWindow, postMessage } = buildWindow({
      referrer: `${HOST_ORIGIN}/workspace/crm`,
    });

    expect(
      handleEmbeddingHostLinkClick({
        url: DIALOG_URL,
        event: buildEvent(),
        currentWindow,
      }),
    ).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(expect.anything(), HOST_ORIGIN);
  });

  it('should leave links alone when the app is not embedded', () => {
    const { currentWindow, postMessage } = buildWindow({
      isEmbedded: false,
      ancestorOrigins: [HOST_ORIGIN],
    });
    const event = buildEvent();

    expect(
      handleEmbeddingHostLinkClick({ url: DIALOG_URL, event, currentWindow }),
    ).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('should leave links to other origins alone', () => {
    const { currentWindow, postMessage } = buildWindow({
      ancestorOrigins: [HOST_ORIGIN],
    });

    expect(
      handleEmbeddingHostLinkClick({
        url: 'https://example.com/page',
        event: buildEvent(),
        currentWindow,
      }),
    ).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('should leave modified and non-primary clicks alone', () => {
    const { currentWindow, postMessage } = buildWindow({
      ancestorOrigins: [HOST_ORIGIN],
    });

    for (const event of [
      buildEvent({ metaKey: true }),
      buildEvent({ ctrlKey: true }),
      buildEvent({ shiftKey: true }),
      buildEvent({ altKey: true }),
      buildEvent({ button: 1 }),
    ]) {
      expect(
        handleEmbeddingHostLinkClick({ url: DIALOG_URL, event, currentWindow }),
      ).toBe(false);
    }

    expect(postMessage).not.toHaveBeenCalled();
  });

  it('should post without a click event for the open-link button', () => {
    const { currentWindow, postMessage } = buildWindow({
      ancestorOrigins: [HOST_ORIGIN],
    });

    expect(postLinkToEmbeddingHost({ url: DIALOG_URL, currentWindow })).toBe(
      true,
    );
    expect(postMessage).toHaveBeenCalledWith(
      { type: 'wschat:open-link', url: DIALOG_URL },
      HOST_ORIGIN,
    );
  });

  it('should ignore a parent on the same origin as the app', () => {
    const { currentWindow, postMessage } = buildWindow({
      ancestorOrigins: ['https://taxi555.wschat.org'],
    });

    expect(
      handleEmbeddingHostLinkClick({
        url: 'https://taxi555.wschat.org/objects/people',
        event: buildEvent(),
        currentWindow,
      }),
    ).toBe(false);
    expect(postMessage).not.toHaveBeenCalled();
  });
});
