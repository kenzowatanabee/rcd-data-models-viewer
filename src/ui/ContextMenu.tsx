import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { nextIndex } from './settings';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** A line above this item. */
  separator?: boolean;
  /** Shown muted at the end: a shortcut or a state. */
  hint?: string;
  checked?: boolean;
}

interface Props {
  /** Where it opens, in viewport pixels; kept inside the window. */
  x: number;
  y: number;
  label: string;
  items: readonly MenuItem[];
  onClose: () => void;
}

/**
 * A small menu at a point (right-click, the context menu key, a ⋯ button):
 * arrows move, Enter picks, Esc or a click elsewhere closes, and focus goes
 * back to where it was.
 */
export function ContextMenu({ x, y, label, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ left: x, top: y });
  const enabled = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !item.disabled);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (menu === null) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const box = menu.getBoundingClientRect();
    setPlace({
      left: Math.max(4, Math.min(x, window.innerWidth - box.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - box.height - 4)),
    });
    menu
      .querySelector<HTMLElement>('.context-menu-item:not([disabled])')
      ?.focus();
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [x, y]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onBlur = () => onClose();
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={label}
      style={{ left: place.left, top: place.top }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
          return;
        }
        const buttons = [
          ...(ref.current?.querySelectorAll<HTMLElement>(
            '.context-menu-item:not([disabled])',
          ) ?? []),
        ];
        const at = buttons.indexOf(document.activeElement as HTMLElement);
        const next = nextIndex(at, buttons.length, event.key);
        if (next !== null) {
          event.preventDefault();
          event.stopPropagation();
          buttons[next]?.focus();
        }
      }}
    >
      {items.map((item, index) => (
        <div key={index} role="none">
          {item.separator && (
            <div className="context-menu-sep" role="separator" />
          )}
          <button
            type="button"
            role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
            aria-checked={item.checked}
            className="context-menu-item"
            disabled={item.disabled}
            tabIndex={enabled[0]?.index === index ? 0 : -1}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span>{item.label}</span>
            {item.hint !== undefined && (
              <span className="context-menu-hint">{item.hint}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
