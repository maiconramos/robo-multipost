'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { CloseIcon } from './icons';

let scrollLocks = 0;

export function ResponsiveDrawer({
  open,
  onClose,
  title,
  children,
  routeKey,
  side = 'start',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  routeKey?: string;
  side?: 'start' | 'bottom';
}) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const previousRoute = useRef(routeKey);
  useEffect(() => {
    if (previousRoute.current !== routeKey) close.current();
    previousRoute.current = routeKey;
  }, [routeKey]);
  useEffect(() => {
    if (!open) return;
    const media = window.matchMedia('(max-width: 1025px)');
    if (!media.matches) {
      close.current();
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('button')?.focus();
    scrollLocks++;
    document.body.classList.add('responsiveDrawerOpen');
    const viewport = (event: MediaQueryListEvent) => {
      if (!event.matches) close.current();
    };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest('[role="dialog"]') &&
        !panel.current?.contains(target)
      )
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const controls = Array.from(
        panel.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]'
        ) || []
      ).filter(
        (element) =>
          element.getClientRects().length && !element.closest('[hidden]')
      );
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    media.addEventListener('change', viewport);
    document.addEventListener('keydown', keydown, true);
    return () => {
      media.removeEventListener('change', viewport);
      document.removeEventListener('keydown', keydown, true);
      if (--scrollLocks === 0)
        document.body.classList.remove('responsiveDrawerOpen');
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="hidden mobile:flex fixed inset-0 z-[550]">
      <div
        data-testid="responsive-drawer-backdrop"
        className="absolute inset-0 bg-popup backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          side === 'start'
            ? 'relative flex flex-col bg-newBgColorInner text-newTextColor w-[300px] max-w-[90vw] h-[100dvh] p-[16px] gap-[16px] overflow-y-auto'
            : 'relative mt-auto text-newTextColor w-full max-h-[85dvh] flex flex-col bg-newBgColorInner rounded-t-[24px] p-[16px] gap-[16px] overflow-y-auto'
        }
      >
        <div className="flex items-center gap-[12px] shrink-0">
          <h2 className="flex-1 text-[20px] font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close', 'Close')}
            className="flex items-center justify-center h-[44px] w-[44px] rounded-[8px] bg-btnSimple text-btnText focus-visible:ring-2 ring-btnPrimary"
          >
            <CloseIcon />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
