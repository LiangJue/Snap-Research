import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { menuPopoverPanelClassName } from '@ui/shared/button-styles';
import { useDismissableLayer } from '@ui/shared/useDismissableLayer';

export type MenuPopoverSide = 'top' | 'bottom';
export type MenuPopoverAlign = 'start' | 'end';

export type MenuPopoverTriggerProps = {
  type: 'button';
  onClick: () => void;
  disabled?: boolean;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
};

export type MenuPopoverProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
  side?: MenuPopoverSide;
  align?: MenuPopoverAlign;
  panelMinWidth?: number;
  panelMaxHeight?: number;
  panelClassName?: string;
  className?: string;
  trigger: (props: MenuPopoverTriggerProps) => ReactNode;
  children: ReactNode;
};

export function MenuPopover(props: MenuPopoverProps) {
  const {
    open,
    onOpenChange,
    disabled,
    ariaLabel,
    side = 'bottom',
    align = 'end',
    panelMinWidth,
    panelMaxHeight,
    panelClassName,
    className,
    trigger,
    children,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [resolvedAlign, setResolvedAlign] = useState<MenuPopoverAlign>(align);

  useEffect(() => {
    if (!open) return;
    if (!disabled) return;
    onOpenChange(false);
  }, [disabled, onOpenChange, open]);

  useDismissableLayer({
    open,
    containerRef,
    onDismiss: () => onOpenChange(false),
  });

  useLayoutEffect(() => {
    if (!open) {
      setResolvedAlign(align);
      return;
    }

    const update = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportWidth = Math.max(1, Number(globalThis.innerWidth || document.documentElement?.clientWidth || 0));
      const width = Math.max(1, Number(panelMinWidth || 170));
      const viewportPadding = 8;
      const startFits = rect.left + width <= viewportWidth - viewportPadding;
      const endFits = rect.right - width >= viewportPadding;
      const next =
        align === 'end' && !endFits && startFits ? 'start' : align === 'start' && !startFits && endFits ? 'end' : align;
      setResolvedAlign(next);
    };

    update();
    globalThis.addEventListener?.('resize', update, { passive: true });
    return () => globalThis.removeEventListener?.('resize', update);
  }, [align, open, panelMinWidth]);

  const panelPosClassName = useMemo(() => {
    const alignClass = resolvedAlign === 'start' ? 'tw-left-0' : 'tw-right-0';
    const sideClass = side === 'top' ? 'tw-bottom-[calc(100%+8px)] tw-top-auto' : 'tw-top-[calc(100%+8px)]';
    return ['tw-absolute', alignClass, sideClass].join(' ');
  }, [resolvedAlign, side]);

  const backdropOriginClassName = useMemo(() => {
    if (side === 'top') {
      return resolvedAlign === 'start' ? 'tw-origin-bottom-left' : 'tw-origin-bottom-right';
    }
    return resolvedAlign === 'start' ? 'tw-origin-top-left' : 'tw-origin-top-right';
  }, [resolvedAlign, side]);

  const basePanelClassName = useMemo(() => {
    const inferredMinWidth = typeof panelMinWidth === 'number' && Number.isFinite(panelMinWidth) ? panelMinWidth : 170;
    const minWidthPreset: 150 | 170 = inferredMinWidth <= 150 ? 150 : 170;
    return [panelPosClassName, menuPopoverPanelClassName(minWidthPreset), panelClassName || ''].join(' ').trim();
  }, [panelClassName, panelMinWidth, panelPosClassName]);

  const panelStyle = useMemo(() => {
    const style: Record<string, string> = {};
    if (typeof panelMinWidth === 'number' && Number.isFinite(panelMinWidth) && panelMinWidth > 0) {
      style.minWidth = `${Math.round(panelMinWidth)}px`;
    }
    style.maxWidth = 'calc(100vw - 16px)';
    if (typeof panelMaxHeight === 'number' && Number.isFinite(panelMaxHeight) && panelMaxHeight > 0) {
      style.maxHeight = `${Math.round(panelMaxHeight)}px`;
      style.overflowY = 'auto';
      style.overscrollBehavior = 'contain';
    }
    return style;
  }, [panelMaxHeight, panelMinWidth]);

  const backdropStyle = useMemo(() => {
    const { overflowY: _overflowY, overscrollBehavior: _overscrollBehavior, ...backdropStyleProps } = panelStyle;
    return backdropStyleProps;
  }, [panelStyle]);

  return (
    <div ref={containerRef} className={['tw-relative', className || ''].join(' ').trim()}>
      {trigger({
        type: 'button',
        disabled,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        onClick: () => onOpenChange(!open),
      })}

      {open ? (
        <div
          aria-hidden="true"
          className={[
            panelPosClassName,
            backdropOriginClassName,
            'webclipper-menu-popover-backdrop tw-z-20 tw-pointer-events-none',
            'tw-bg-[color-mix(in_srgb,var(--bg-card)_55%,transparent)]',
            'tw-backdrop-blur-[16px] tw-backdrop-saturate-150',
            'tw-scale-[1.06]',
            'tw-shadow-[0_14px_40px_rgba(0,0,0,0.16)]',
          ].join(' ')}
          style={backdropStyle}
        />
      ) : null}

      <div role="menu" aria-label={ariaLabel} hidden={!open} className={basePanelClassName} style={panelStyle}>
        {children}
      </div>
    </div>
  );
}
