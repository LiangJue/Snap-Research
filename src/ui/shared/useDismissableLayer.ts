import { useEffect, useRef } from 'react';

export type UseDismissableLayerOptions = {
  open: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  onDismiss: () => void;
};

export function isEventInsideDismissableContainer(event: Event, container: HTMLElement): boolean {
  try {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
    const NodeCtor = container.ownerDocument.defaultView?.Node;
    if (
      path.some(
        (entry) =>
          entry === container ||
          Boolean(NodeCtor && entry instanceof NodeCtor && container.contains(entry as unknown as Node)),
      )
    ) {
      return true;
    }
  } catch (_error) {
    // Fall back to target containment for synthetic or legacy events.
  }

  const target = event.target as Node | null;
  return Boolean(target && container.contains(target));
}

export function useDismissableLayer(options: UseDismissableLayerOptions) {
  const { open, containerRef, onDismiss } = options;
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) {
        onDismissRef.current();
        return;
      }
      if (!isEventInsideDismissableContainer(event, container)) onDismissRef.current();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismissRef.current();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, false);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, false);
    };
  }, [open, containerRef]);
}
