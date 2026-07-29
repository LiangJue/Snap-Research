import tailwindCss from '@ui/styles/tailwind.css?inline';
import inpageCommentsPanelCss from '@ui/styles/inpage-comments-panel.css?raw';
import buttonsCss from '@ui/styles/buttons.css?raw';
import tokensCss from '@ui/styles/tokens.css?raw';

function toHostTokensCss(css: string) {
  return css.replaceAll(':root', ':host');
}

const RESEARCH_SIDEBAR_CSS = [
  toHostTokensCss(String(tokensCss || '')),
  String(buttonsCss || ''),
  String(tailwindCss || ''),
  String(inpageCommentsPanelCss || ''),
  `
.webclipper-inpage-comments-panel__react-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

[data-detail-header-actions='true'] {
  position: relative;
  z-index: 40;
}

[data-reader-outline-toolbar-slot] {
  z-index: 30;
}

.webclipper-inpage-research-panel__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 14px 14px 28px;
  background: var(--webclipper-comments-panel-surface-bg, var(--bg-card));
  scrollbar-width: thin;
  scrollbar-color: color-mix(in srgb, var(--text-secondary) 55%, transparent) transparent;
}

.webclipper-inpage-research-panel__body a {
  color: inherit;
}

.webclipper-inpage-research-panel__body--detail {
  padding: 0;
}

.webclipper-inpage-research-panel__comments {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: var(--webclipper-comments-panel-surface-bg, var(--bg-card));
}

@media (max-width: 420px) {
  .webclipper-inpage-research-panel__body:not(.webclipper-inpage-research-panel__body--detail) {
    padding-inline: 12px;
  }
}
`,
]
  .filter(Boolean)
  .join('\n');

export function buildResearchSidebarShadowCss(): string {
  return RESEARCH_SIDEBAR_CSS;
}
