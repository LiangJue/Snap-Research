import type { ReaderOutlineDomEntry } from '@ui/reader/article-outline-dom';

export function scrollOutlineEntryIntoView(entry: ReaderOutlineDomEntry, scrollRoot?: Element | null): void {
  if (scrollRoot) {
    const root = scrollRoot as HTMLElement;
    const scrollTo = root.scrollTo;
    const currentTop = Number(root.scrollTop);
    if (typeof scrollTo === 'function' && Number.isFinite(currentTop)) {
      const rootRect = root.getBoundingClientRect();
      const entryRect = entry.element.getBoundingClientRect();
      const nextTop = Math.max(0, currentTop + entryRect.top - rootRect.top);
      root.scrollTo({ top: nextTop, behavior: 'smooth' });
      return;
    }
  }

  try {
    entry.element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (_error) {
    entry.element.scrollIntoView();
  }
}
