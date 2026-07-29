import { useCallback, useState } from 'react';

import { UI_MESSAGE_TYPES } from '@services/protocols/message-contracts';
import { send } from '@services/shared/runtime';

type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  error: { message: string; extra: unknown } | null;
};

export function usePopupResearchCapture() {
  const [opening, setOpening] = useState(false);

  const open = useCallback(async () => {
    if (opening) return false;
    setOpening(true);
    try {
      const response = await send<ApiResponse<{ opened: boolean }>>(UI_MESSAGE_TYPES.OPEN_RESEARCH_CAPTURE, {
        source: 'popup',
      });
      return Boolean(response?.ok && response.data?.opened);
    } catch (_error) {
      return false;
    } finally {
      setOpening(false);
    }
  }, [opening]);

  return {
    disabled: opening,
    open,
  };
}
