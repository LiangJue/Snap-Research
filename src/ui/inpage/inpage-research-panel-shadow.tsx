import { createElement, useState } from 'react';
import { createRoot, type Root as ReactRoot } from 'react-dom/client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { createDockController } from '@ui/comments/dock';
import { installSidebarResize } from '@ui/comments/resize';
import { ArticleCommentsSection } from '@ui/conversations/ArticleCommentsSection';
import { ConversationDetailPane } from '@ui/conversations/ConversationDetailPane';
import { ResearchTaskPanel } from '@ui/research/ResearchCardView';
import { buildResearchSidebarShadowCss } from '@ui/research/research-sidebar-shadow-styles';
import { headerButtonClassName } from '@ui/shared/button-styles';
import { ConversationsProvider, useConversationsApp } from '@viewmodels/conversations/conversations-context';

export type InpageResearchPanelOpenInput = {
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

export type InpageResearchPanelApi = {
  open: (input: InpageResearchPanelOpenInput) => void;
  close: () => void;
  isOpen: () => boolean;
};

const PANEL_ID = 'webclipper-inpage-research-panel';

let singleton: {
  el: HTMLElement;
  root: ReactRoot;
  api: InpageResearchPanelApi;
  render: (input: InpageResearchPanelOpenInput) => void;
} | null = null;

function setImportantStyle(el: HTMLElement, name: string, value: string) {
  el.style.setProperty(name, value, 'important');
}

function ResearchSidebarDetail(props: { onRequestClose: () => void }) {
  const { selectedConversation } = useConversationsApp();
  const [view, setView] = useState<'detail' | 'comments'>('detail');
  const conversationId = Number(selectedConversation?.id);
  const canonicalUrl = String(selectedConversation?.url || '').trim();

  if (view === 'comments') {
    return (
      <div className="webclipper-inpage-comments-panel__surface">
        <header className="webclipper-inpage-comments-panel__header">
          <div className="webclipper-inpage-comments-panel__header-title tw-flex tw-items-center tw-gap-2">
            <button
              type="button"
              className={headerButtonClassName()}
              aria-label="返回研究详情"
              onClick={() => setView('detail')}
            >
              <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            <span>Comments</span>
          </div>
        </header>
        <main className="webclipper-inpage-research-panel__comments">
          {Number.isFinite(conversationId) && conversationId > 0 && canonicalUrl ? (
            <ArticleCommentsSection
              conversationId={conversationId}
              canonicalUrl={canonicalUrl}
              containerClassName="tw-h-full tw-min-h-0"
            />
          ) : (
            <div className="tw-p-4 tw-text-sm tw-text-[var(--text-secondary)]">评论正在载入…</div>
          )}
        </main>
      </div>
    );
  }

  return (
    <main className="webclipper-inpage-research-panel__body webclipper-inpage-research-panel__body--detail route-scroll">
      <ConversationDetailPane
        onBack={props.onRequestClose}
        onTriggerCommentsSidebar={() => setView('comments')}
        commentsSidebarOpen={false}
      />
    </main>
  );
}

function ResearchSidebarSurface(props: { input: InpageResearchPanelOpenInput; onRequestClose: () => void }) {
  const source = String(props.input.source || '').trim();
  const conversationKey = String(props.input.conversationKey || '').trim();

  if (source && conversationKey) {
    return (
      <ConversationsProvider
        key={`${source}:${conversationKey}`}
        initialOpenLoc={{
          source,
          conversationKey,
        }}
      >
        <ResearchSidebarDetail onRequestClose={props.onRequestClose} />
      </ConversationsProvider>
    );
  }

  return (
    <div className="webclipper-inpage-comments-panel__surface">
      <header className="webclipper-inpage-comments-panel__header">
        <div className="webclipper-inpage-comments-panel__header-title">Snap Research</div>
        <div className="webclipper-inpage-comments-panel__header-actions">
          <button
            type="button"
            className="webclipper-inpage-comments-panel__collapse webclipper-btn header-button"
            aria-label="收起研究侧栏"
            onClick={props.onRequestClose}
          >
            <ChevronRight size={14} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>
      </header>
      <main className="webclipper-inpage-research-panel__body">
        <ResearchTaskPanel taskId={props.input.taskId} cardId={props.input.cardId} status={props.input.status} />
      </main>
    </div>
  );
}

function ensurePanel(): NonNullable<typeof singleton> {
  if (singleton && document.getElementById(PANEL_ID) === singleton.el) return singleton;

  const el = document.createElement('webclipper-inpage-research-panel');
  el.id = PANEL_ID;
  el.setAttribute('data-overlay', '1');
  el.setAttribute('data-variant', 'sidebar');
  setImportantStyle(el, '--webclipper-comments-panel-surface-bg', 'var(--bg-card)');
  setImportantStyle(el, 'display', 'none');

  const dockController = createDockController({ enabled: true, panelEl: el });
  const shadow = el.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = buildResearchSidebarShadowCss();
  shadow.appendChild(style);

  const rootHost = document.createElement('div');
  rootHost.className = 'webclipper-inpage-comments-panel__react-root';
  setImportantStyle(rootHost, 'display', 'flex');
  setImportantStyle(rootHost, 'flex-direction', 'column');
  setImportantStyle(rootHost, 'min-height', '0');
  setImportantStyle(rootHost, 'overflow', 'hidden');
  setImportantStyle(rootHost, 'height', '100%');
  shadow.appendChild(rootHost);

  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'webclipper-inpage-comments-panel__resize-handle';
  shadow.appendChild(resizeHandle);
  installSidebarResize({
    panelEl: el,
    handleEl: resizeHandle,
    isOverlay: true,
    readPanelWidthPx: () => dockController.readWidthPx(),
    onWidthApplied: () => dockController.syncWidth(),
  });

  const root = createRoot(rootHost);
  let currentInput: InpageResearchPanelOpenInput = { taskId: '' };
  let api: InpageResearchPanelApi;
  const render = (input: InpageResearchPanelOpenInput) => {
    currentInput = input;
    root.render(createElement(ResearchSidebarSurface, { input: currentInput, onRequestClose: () => api.close() }));
  };

  api = {
    open(input) {
      const taskId = String(input?.taskId || '').trim();
      if (!taskId) return;
      render({
        taskId,
        cardId: String(input?.cardId || '').trim() || null,
        status: String(input?.status || '').trim() || null,
        conversationId: Number(input?.conversationId) || null,
        source: String(input?.source || '').trim() || null,
        conversationKey: String(input?.conversationKey || '').trim() || null,
        title: String(input?.title || '').trim() || null,
        url: String(input?.url || '').trim() || null,
      });
      el.setAttribute('data-open', '1');
      setImportantStyle(el, 'display', 'block');
      dockController.setOpen(true);
    },
    close() {
      el.removeAttribute('data-open');
      setImportantStyle(el, 'display', 'none');
      dockController.setOpen(false);
    },
    isOpen() {
      return el.getAttribute('data-open') === '1';
    },
  };

  document.documentElement.appendChild(el);
  singleton = { el, root, api, render };
  return singleton;
}

export function getInpageResearchPanelApi(): InpageResearchPanelApi {
  return {
    open(input) {
      ensurePanel().api.open(input);
    },
    close() {
      singleton?.api.close();
    },
    isOpen() {
      return singleton?.api.isOpen() ?? false;
    },
  };
}
