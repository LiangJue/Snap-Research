import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, FileInput, MessageSquareText, ScanSearch, Settings as SettingsIcon } from 'lucide-react';

import { openOrFocusExtensionAppTab } from '@services/shared/webext';
import { storageGet, storageSet } from '@services/shared/storage';
import { buildConversationRouteFromLoc, encodeConversationLoc } from '@services/shared/conversation-loc';

import { t } from '@i18n';
import { useConversationsApp, ConversationsProvider } from '@viewmodels/conversations/conversations-context';
import { ConversationsScene } from '@ui/conversations/ConversationsScene';
import { buttonFilledClassName, buttonTintClassName, headerButtonClassName } from '@ui/shared/button-styles';
import { AppTooltipHost, tooltipAttrs } from '@ui/shared/AppTooltip';
import {
  usePopupCurrentPageCapture,
  type ChatGptResearchImportPreview,
} from '@viewmodels/popup/usePopupCurrentPageCapture';
import { usePopupOpenCurrentTabInpageCommentsSidebar } from '@viewmodels/popup/usePopupOpenAppCommentsConversation';
import { useAppThemeMode } from '@viewmodels/theme/useAppThemeMode';
import { usePopupResearchCapture } from '@viewmodels/popup/usePopupResearchCapture';
import { send } from '@services/shared/runtime';
import { UI_MESSAGE_TYPES } from '@services/protocols/message-contracts';
import type { Conversation } from '@services/conversations/domain/models';

const POPUP_NOTION_SYNC_NUDGE_DISMISSED_KEY = 'webclipper_popup_notion_sync_open_tab_dont_show_v1';
const POPUP_FEISHU_SYNC_NUDGE_DISMISSED_KEY = 'webclipper_popup_feishu_sync_open_tab_dont_show_v1';

async function getPopupNotionSyncNudgeDismissed(): Promise<boolean> {
  const res = await storageGet([POPUP_NOTION_SYNC_NUDGE_DISMISSED_KEY]).catch(() => ({}));
  return Boolean((res as any)?.[POPUP_NOTION_SYNC_NUDGE_DISMISSED_KEY]);
}

async function setPopupNotionSyncNudgeDismissed(next: boolean): Promise<void> {
  await storageSet({ [POPUP_NOTION_SYNC_NUDGE_DISMISSED_KEY]: Boolean(next) });
}

async function getPopupFeishuSyncNudgeDismissed(): Promise<boolean> {
  const res = await storageGet([POPUP_FEISHU_SYNC_NUDGE_DISMISSED_KEY]).catch(() => ({}));
  return Boolean((res as any)?.[POPUP_FEISHU_SYNC_NUDGE_DISMISSED_KEY]);
}

async function setPopupFeishuSyncNudgeDismissed(next: boolean): Promise<void> {
  await storageSet({ [POPUP_FEISHU_SYNC_NUDGE_DISMISSED_KEY]: Boolean(next) });
}

type PopupSyncNudgeDialogProps = {
  open: boolean;
  ariaLabel: string;
  title: string;
  body: string;
  dontShowAriaLabel: string;
  dontShowLabel: string;
  dismissLabel: string;
  confirmLabel: string;
  dontShowAgain: boolean;
  onDontShowAgainChange: (next: boolean) => void;
  onDismiss: () => void;
  onConfirm: () => void;
};

function PopupSyncNudgeDialog(props: PopupSyncNudgeDialogProps) {
  const {
    open,
    ariaLabel,
    title,
    body,
    dontShowAriaLabel,
    dontShowLabel,
    dismissLabel,
    confirmLabel,
    dontShowAgain,
    onDontShowAgainChange,
    onDismiss,
    onConfirm,
  } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const cancelButtonClassName = buttonTintClassName();
  const confirmButtonClassName = buttonFilledClassName();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [onDismiss, open]);

  if (!open) return null;

  return (
    <div
      className="tw-fixed tw-inset-0 tw-z-50 tw-flex tw-items-center tw-justify-center tw-bg-[var(--bg-overlay)] tw-p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onMouseDown={(event) => {
        const target = event.target as Node | null;
        if (target && panelRef.current?.contains(target)) return;
        onDismiss();
      }}
    >
      <div
        ref={panelRef}
        className="tw-w-full tw-max-w-[420px] tw-rounded-[var(--radius-card)] tw-border tw-border-[var(--border)] tw-bg-[var(--bg-card)] tw-p-4 tw-text-[var(--text-primary)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="tw-text-sm tw-font-extrabold">{title}</div>
        <div className="tw-mt-2 tw-text-xs tw-font-semibold tw-text-[var(--text-secondary)]">{body}</div>

        <label className="tw-mt-3 tw-flex tw-cursor-pointer tw-select-none tw-items-start tw-gap-2 tw-rounded-[var(--radius-control)] tw-border tw-border-[var(--border)] tw-bg-[var(--bg-sunken)] tw-p-2.5">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => onDontShowAgainChange(event.target.checked)}
            className="tw-mt-0.5 tw-size-4 tw-cursor-pointer tw-accent-[var(--accent)] focus-visible:tw-outline focus-visible:tw-outline-2 focus-visible:tw-outline-offset-2 focus-visible:tw-outline-[var(--focus-ring)]"
            aria-label={dontShowAriaLabel}
          />
          <span className="tw-text-xs tw-font-semibold tw-text-[var(--text-primary)]">{dontShowLabel}</span>
        </label>

        <div className="tw-mt-4 tw-flex tw-justify-end tw-gap-2">
          <button type="button" className={cancelButtonClassName} onClick={onDismiss}>
            {dismissLabel}
          </button>
          <button type="button" className={confirmButtonClassName} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PopupWebResearchDialog(props: {
  preview: ChatGptResearchImportPreview | null;
  busy: boolean;
  saveConversation: boolean;
  errorMessage: string | null;
  onSaveConversationChange: (next: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.preview) return null;
  return (
    <div
      className="tw-fixed tw-inset-0 tw-z-[100] tw-flex tw-items-center tw-justify-center tw-bg-black/45 tw-p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`确认导入当前 ${props.preview.providerName} 研究`}
    >
      <section
        className="tw-flex tw-max-h-[82vh] tw-w-full tw-max-w-[440px] tw-flex-col tw-gap-3 tw-border tw-border-[var(--border-color)] tw-bg-[var(--bg-card)] tw-p-4 tw-shadow-xl"
        style={{ borderRadius: 'var(--radius-card)' }}
      >
        <div>
          <h2 className="tw-text-base tw-font-black">导入当前 {props.preview.providerName} 研究</h2>
          <p className="tw-mt-1 tw-text-xs tw-text-[var(--text-secondary)]">Report：{props.preview.reportId}</p>
        </div>
        <div className="tw-grid tw-grid-cols-2 tw-gap-2 tw-text-sm">
          <div className="tw-border tw-border-[var(--border-color)] tw-bg-[var(--bg-secondary)] tw-p-2">
            <div className="tw-text-xs tw-text-[var(--text-secondary)]">Research 任务</div>
            <div className="tw-font-black">{props.preview.taskCount}</div>
          </div>
          <div className="tw-border tw-border-[var(--border-color)] tw-bg-[var(--bg-secondary)] tw-p-2">
            <div className="tw-text-xs tw-text-[var(--text-secondary)]">证据</div>
            <div className="tw-font-black">{props.preview.evidenceCount}</div>
          </div>
        </div>
        <div className="tw-min-h-0 tw-overflow-auto">
          <div className="tw-mb-1 tw-text-xs tw-font-bold tw-text-[var(--text-secondary)]">将要导入</div>
          <ol className="tw-space-y-1 tw-pl-5 tw-text-sm">
            {props.preview.taskTitles.map((title, index) => (
              <li key={`${index}-${title}`} className="tw-list-decimal">
                {title}
              </li>
            ))}
          </ol>
        </div>
        <label className="tw-flex tw-items-center tw-gap-2 tw-text-sm">
          <input
            type="checkbox"
            checked={props.saveConversation}
            onChange={(event) => props.onSaveConversationChange(event.currentTarget.checked)}
          />
          同时保存完整 {props.preview.providerName} 对话
        </label>
        {props.errorMessage ? (
          <div
            className="tw-border tw-border-[var(--error)] tw-bg-[color-mix(in_srgb,var(--error)_14%,var(--bg-card))] tw-p-2 tw-text-xs tw-font-semibold tw-text-[var(--error)]"
            role="alert"
          >
            {props.errorMessage}
          </div>
        ) : null}
        <div className="tw-flex tw-justify-end tw-gap-2">
          <button type="button" className={buttonTintClassName()} disabled={props.busy} onClick={props.onCancel}>
            取消
          </button>
          <button type="button" className={buttonFilledClassName()} disabled={props.busy} onClick={props.onConfirm}>
            {props.busy ? '正在导入…' : '确认导入'}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function PopupShell() {
  useAppThemeMode();

  return (
    <ConversationsProvider>
      <PopupShellFrame />
      <AppTooltipHost />
    </ConversationsProvider>
  );
}

function PopupShellFrame() {
  const { refreshList, refreshActiveDetail, selectedConversation } = useConversationsApp();
  const [notionSyncNudgeOpen, setNotionSyncNudgeOpen] = useState(false);
  const [notionSyncNudgeDontShowAgain, setNotionSyncNudgeDontShowAgain] = useState(false);
  const [feishuSyncNudgeOpen, setFeishuSyncNudgeOpen] = useState(false);
  const [feishuSyncNudgeDontShowAgain, setFeishuSyncNudgeDontShowAgain] = useState(false);
  const [chatGptResearchPreview, setChatGptResearchPreview] = useState<ChatGptResearchImportPreview | null>(null);
  const [saveChatGptConversation, setSaveChatGptConversation] = useState(true);
  const commentsButton = usePopupOpenCurrentTabInpageCommentsSidebar();
  const researchCapture = usePopupResearchCapture();
  const researchCaptureLabel = researchCapture.disabled ? t('openingCaptureAndResearch') : t('captureAndResearch');
  const {
    buttonDisabled,
    buttonLabel,
    capture,
    status,
    captureState,
    researchImportAvailable,
    researchImporting,
    previewChatGptResearch,
    importChatGptResearch,
  } = usePopupCurrentPageCapture({
    onCaptured: async () => {
      await refreshList();
      await refreshActiveDetail();
    },
  });

  const onPreviewChatGptResearch = useCallback(() => {
    void previewChatGptResearch()
      .then((preview) => {
        setSaveChatGptConversation(true);
        setChatGptResearchPreview(preview);
      })
      .catch(() => {});
  }, [previewChatGptResearch]);

  const onConfirmChatGptResearch = useCallback(() => {
    void importChatGptResearch({ saveConversation: saveChatGptConversation })
      .then((result) => {
        if (result) setChatGptResearchPreview(null);
      })
      .catch(() => {});
  }, [importChatGptResearch, saveChatGptConversation]);

  const onOpenSelectedConversationComments = useCallback(() => {
    void (async () => {
      const convo: any = selectedConversation;
      const source = String(convo?.source || '').trim();
      const conversationKey = String(convo?.conversationKey || '').trim();
      if (!source || !conversationKey) return;

      const loc = encodeConversationLoc({ source, conversationKey });
      const route = buildConversationRouteFromLoc(loc);
      const opened = await openOrFocusExtensionAppTab({ route });
      if (opened) window.close();
    })();
  }, [selectedConversation]);

  const onOpenResearchInCurrentPage = useCallback((conversation: Conversation) => {
    if (String(conversation.sourceType || '') !== 'research') return false;
    const taskId = String(conversation.researchTaskId || '').trim();
    const reportId = String(conversation.researchReportId || '').trim();
    if (!taskId && !reportId) return false;

    const openDetailFallback = async () => {
      const source = String(conversation.source || '').trim();
      const conversationKey = String(conversation.conversationKey || '').trim();
      if (!source || !conversationKey) return;
      const loc = encodeConversationLoc({ source, conversationKey });
      const opened = await openOrFocusExtensionAppTab({ route: buildConversationRouteFromLoc(loc) });
      if (opened) window.close();
    };

    void send<any>(UI_MESSAGE_TYPES.OPEN_CURRENT_TAB_INPAGE_RESEARCH_PANEL, {
      taskId,
      reportId,
      cardId: String(conversation.researchCardId || '').trim() || null,
      status: String(conversation.researchStatus || '').trim() || null,
      conversationId: Number(conversation.id) || null,
      source: String(conversation.source || '').trim() || null,
      conversationKey: String(conversation.conversationKey || '').trim() || null,
      title: String(conversation.title || '').trim() || null,
      url: String(conversation.url || '').trim() || null,
    })
      .then((response) => {
        if (response?.ok) {
          window.close();
          return;
        }
        void openDetailFallback();
      })
      .catch(() => {
        void openDetailFallback();
      });
    return true;
  }, []);

  const onOpenLibrary = useCallback(async () => {
    const opened = await openOrFocusExtensionAppTab({ route: '/' });
    if (opened) window.close();
  }, []);

  const onOpenSettings = useCallback(async () => {
    await openOrFocusExtensionAppTab({ route: '/settings' });
    window.close();
  }, []);

  const onOpenInsightSettings = useCallback(async () => {
    await openOrFocusExtensionAppTab({ route: '/settings?section=aboutyou' });
    window.close();
  }, []);

  const onOpenProviderSettings = useCallback(async (section: string) => {
    const safeSection =
      String(section || '')
        .trim()
        .toLowerCase() || 'notion';
    await openOrFocusExtensionAppTab({ route: `/settings?section=${encodeURIComponent(safeSection)}` });
    window.close();
  }, []);

  const onPopupNotionSyncStarted = () => {
    void (async () => {
      const dismissed = await getPopupNotionSyncNudgeDismissed().catch(() => false);
      if (dismissed) {
        await openOrFocusExtensionAppTab({ route: '/' });
        window.close();
        return;
      }
      setNotionSyncNudgeDontShowAgain(false);
      setNotionSyncNudgeOpen(true);
    })();
  };

  const persistNotionNudgeIfNeeded = async () => {
    if (!notionSyncNudgeDontShowAgain) return;
    await setPopupNotionSyncNudgeDismissed(true);
  };

  const onConfirmNotionSyncNudge = () => {
    void (async () => {
      setNotionSyncNudgeOpen(false);
      await persistNotionNudgeIfNeeded();
      await openOrFocusExtensionAppTab({ route: '/' });
      window.close();
    })();
  };

  const onDismissNotionSyncNudge = () => {
    void (async () => {
      setNotionSyncNudgeOpen(false);
      await persistNotionNudgeIfNeeded();
    })();
  };

  const onPopupFeishuSyncStarted = () => {
    void (async () => {
      const dismissed = await getPopupFeishuSyncNudgeDismissed().catch(() => false);
      if (dismissed) {
        await openOrFocusExtensionAppTab({ route: '/' });
        window.close();
        return;
      }
      setFeishuSyncNudgeDontShowAgain(false);
      setFeishuSyncNudgeOpen(true);
    })();
  };

  const persistFeishuNudgeIfNeeded = async () => {
    if (!feishuSyncNudgeDontShowAgain) return;
    await setPopupFeishuSyncNudgeDismissed(true);
  };

  const onConfirmFeishuSyncNudge = () => {
    void (async () => {
      setFeishuSyncNudgeOpen(false);
      await persistFeishuNudgeIfNeeded();
      await openOrFocusExtensionAppTab({ route: '/' });
      window.close();
    })();
  };

  const onDismissFeishuSyncNudge = () => {
    void (async () => {
      setFeishuSyncNudgeOpen(false);
      await persistFeishuNudgeIfNeeded();
    })();
  };

  return (
    <div
      className="tw-flex tw-h-full tw-min-h-0 tw-w-full tw-min-w-0 tw-flex-col tw-bg-[var(--bg-primary)] tw-text-[var(--text-primary)]"
      style={{
        fontFamily: '"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Helvetica Neue",sans-serif',
        fontSize: 13,
        lineHeight: 1.45,
      }}
    >
      <main className="tw-min-h-0 tw-flex-1 tw-overflow-hidden">
        <section id="viewChats" className="tw-h-full tw-min-h-0" aria-label={t('chatsAria')}>
          <div className="tw-flex tw-h-full tw-min-h-0 tw-flex-1 tw-flex-col">
            <ConversationsScene
              listShell={{
                rightSlot: (
                  <>
                    <span className="tw-inline-flex" {...tooltipAttrs(t('openLibrary'))}>
                      <button
                        type="button"
                        onClick={() => onOpenLibrary().catch(() => {})}
                        className={headerButtonClassName()}
                        aria-label={t('openLibrary')}
                      >
                        <BookOpen size={16} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    </span>

                    <span
                      className="tw-inline-flex tw-min-w-0"
                      {...tooltipAttrs(
                        buttonDisabled ? status?.message || t('currentPageCannotBeCaptured') : buttonLabel,
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => capture().catch(() => {})}
                        disabled={buttonDisabled}
                        className={[buttonTintClassName(), 'tw-max-w-[168px] tw-min-w-0'].join(' ')}
                        aria-label={buttonLabel}
                      >
                        <span className="tw-truncate">{buttonLabel}</span>
                      </button>
                    </span>

                    {researchImportAvailable ? (
                      <span
                        className="tw-inline-flex"
                        {...tooltipAttrs(`导入当前 ${captureState.collectorId === 'kimi' ? 'Kimi' : 'ChatGPT'} 研究`)}
                      >
                        <button
                          type="button"
                          onClick={onPreviewChatGptResearch}
                          disabled={researchImporting}
                          className={headerButtonClassName()}
                          aria-label={`导入当前 ${captureState.collectorId === 'kimi' ? 'Kimi' : 'ChatGPT'} 研究`}
                        >
                          <FileInput size={16} strokeWidth={1.6} aria-hidden="true" />
                        </button>
                      </span>
                    ) : null}

                    <span className="tw-inline-flex" {...tooltipAttrs(commentsButton.tooltip)}>
                      <button
                        type="button"
                        onClick={() => {
                          void commentsButton.open().then((ok) => {
                            if (ok) window.close();
                          });
                        }}
                        disabled={commentsButton.disabled}
                        className={headerButtonClassName()}
                        aria-label={commentsButton.ariaLabel}
                      >
                        <MessageSquareText size={16} strokeWidth={1.6} aria-hidden="true" />
                      </button>
                    </span>

                    <button
                      type="button"
                      {...tooltipAttrs(t('openSettings'))}
                      onClick={() => onOpenSettings().catch(() => {})}
                      className={headerButtonClassName()}
                      aria-label={t('openSettingsAria')}
                    >
                      <SettingsIcon size={16} strokeWidth={1.6} aria-hidden="true" />
                    </button>
                  </>
                ),
                belowHeader: (
                  <>
                    <div className="tw-border-b tw-border-[var(--border)] tw-bg-[var(--bg-primary)] tw-px-3 tw-py-2">
                      <span className="tw-inline-flex tw-w-full tw-min-w-0" {...tooltipAttrs(researchCaptureLabel)}>
                        <button
                          type="button"
                          onClick={() => {
                            void researchCapture.open().then((opened) => {
                              if (opened) window.close();
                            });
                          }}
                          disabled={researchCapture.disabled}
                          className={[buttonTintClassName(), 'tw-w-full tw-min-w-0 tw-whitespace-nowrap'].join(' ')}
                          aria-label={researchCaptureLabel}
                        >
                          <ScanSearch size={16} strokeWidth={1.6} aria-hidden="true" />
                          <span className="tw-truncate">{researchCaptureLabel}</span>
                        </button>
                      </span>
                    </div>

                    {status?.message ? (
                      <div
                        className={[
                          'tw-border-b tw-px-3 tw-py-2 tw-text-[11px] tw-font-semibold',
                          status.kind === 'error'
                            ? 'tw-border-[var(--error)] tw-bg-[color-mix(in_srgb,var(--error)_14%,var(--bg-card))] tw-text-[var(--error)]'
                            : 'tw-border-[var(--success)] tw-bg-[color-mix(in_srgb,var(--success)_14%,var(--bg-card))] tw-text-[var(--success)]',
                        ].join(' ')}
                        role={status.kind === 'error' ? 'alert' : 'status'}
                      >
                        {status.message}
                      </div>
                    ) : null}
                  </>
                ),
              }}
              onPopupNotionSyncStarted={onPopupNotionSyncStarted}
              onPopupFeishuSyncStarted={onPopupFeishuSyncStarted}
              onOpenInsightsSection={() => {
                void onOpenInsightSettings().catch(() => {});
              }}
              onOpenSettingsSection={(section) => {
                void onOpenProviderSettings(section).catch(() => {});
              }}
              onOpenCommentsExternally={onOpenSelectedConversationComments}
              onOpenConversationExternally={onOpenResearchInCurrentPage}
              narrowCommentsOpenSource="popup"
            />
          </div>
        </section>
      </main>

      <PopupSyncNudgeDialog
        open={notionSyncNudgeOpen}
        ariaLabel={t('popupNotionSyncNudgeAria')}
        title={t('popupNotionSyncNudgeTitle')}
        body={t('popupNotionSyncNudgeBody')}
        dontShowAriaLabel={t('popupNotionSyncNudgeDontShowAria')}
        dontShowLabel={t('popupNotionSyncNudgeDontShowLabel')}
        dismissLabel={t('popupNotionSyncNudgeDismiss')}
        confirmLabel={t('popupNotionSyncNudgeConfirm')}
        dontShowAgain={notionSyncNudgeDontShowAgain}
        onDontShowAgainChange={setNotionSyncNudgeDontShowAgain}
        onDismiss={onDismissNotionSyncNudge}
        onConfirm={onConfirmNotionSyncNudge}
      />

      <PopupSyncNudgeDialog
        open={feishuSyncNudgeOpen}
        ariaLabel={t('popupFeishuSyncNudgeAria')}
        title={t('popupFeishuSyncNudgeTitle')}
        body={t('popupFeishuSyncNudgeBody')}
        dontShowAriaLabel={t('popupFeishuSyncNudgeDontShowAria')}
        dontShowLabel={t('popupFeishuSyncNudgeDontShowLabel')}
        dismissLabel={t('popupFeishuSyncNudgeDismiss')}
        confirmLabel={t('popupFeishuSyncNudgeConfirm')}
        dontShowAgain={feishuSyncNudgeDontShowAgain}
        onDontShowAgainChange={setFeishuSyncNudgeDontShowAgain}
        onDismiss={onDismissFeishuSyncNudge}
        onConfirm={onConfirmFeishuSyncNudge}
      />

      <PopupWebResearchDialog
        preview={chatGptResearchPreview}
        busy={researchImporting}
        saveConversation={saveChatGptConversation}
        errorMessage={status?.kind === 'error' ? status.message : null}
        onSaveConversationChange={setSaveChatGptConversation}
        onCancel={() => setChatGptResearchPreview(null)}
        onConfirm={onConfirmChatGptResearch}
      />
    </div>
  );
}
