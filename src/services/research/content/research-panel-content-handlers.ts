import { CONTENT_MESSAGE_TYPES } from '@platform/messaging/message-contracts';

type InpageResearchPanelOpenInput = {
  taskId: string;
  reportId?: string | null;
  cardId?: string | null;
  status?: string | null;
  conversationId?: number | null;
  source?: string | null;
  conversationKey?: string | null;
  title?: string | null;
  url?: string | null;
};

type InpageResearchPanelApi = {
  open: (input: InpageResearchPanelOpenInput) => void;
};

type ResearchPanelContentHandlerDeps = {
  panel: InpageResearchPanelApi;
  beforeOpen?: () => void;
};

export function registerInpageResearchPanelContentHandlers(deps: ResearchPanelContentHandlerDeps) {
  const onMessage = (globalThis as any).chrome?.runtime?.onMessage ?? (globalThis as any).browser?.runtime?.onMessage;
  if (!onMessage?.addListener) return () => {};

  const listener = (msg: any, _sender: any, sendResponse: (value: any) => void) => {
    if (msg?.type !== CONTENT_MESSAGE_TYPES.OPEN_INPAGE_RESEARCH_PANEL) return undefined;
    const input: InpageResearchPanelOpenInput = {
      taskId: String(msg?.payload?.taskId || '').trim(),
      ...(String(msg?.payload?.reportId || '').trim() ? { reportId: String(msg.payload.reportId).trim() } : null),
      cardId: String(msg?.payload?.cardId || '').trim() || null,
      status: String(msg?.payload?.status || '').trim() || null,
      conversationId: Number(msg?.payload?.conversationId) || null,
      source: String(msg?.payload?.source || '').trim() || null,
      conversationKey: String(msg?.payload?.conversationKey || '').trim() || null,
      title: String(msg?.payload?.title || '').trim() || null,
      url: String(msg?.payload?.url || '').trim() || null,
    };
    if (!input.taskId && !input.reportId) {
      sendResponse?.({ ok: false, error: 'research task is unavailable' });
      return false;
    }
    deps.beforeOpen?.();
    deps.panel.open(input);
    sendResponse?.({ ok: true });
    return false;
  };

  onMessage.addListener(listener);
  return () => {
    try {
      onMessage.removeListener?.(listener);
    } catch (_error) {
      // ignore
    }
  };
}
