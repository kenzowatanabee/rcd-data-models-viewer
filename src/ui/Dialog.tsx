import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

interface Props {
  className: string;
  /** Accessible name; or name the dialog with `labelledBy`. */
  label?: string;
  labelledBy?: string;
  onClose: () => void;
  /** A click on the backdrop closes the dialog. */
  closeOnBackdrop?: boolean;
  /** Where focus goes on opening; the first control otherwise. */
  initialFocus?: RefObject<HTMLElement | null>;
  onKeyDown?: (event: KeyboardEvent<HTMLDialogElement>) => void;
  /** Runs once the dialog is open and laid out, before focus moves. */
  onOpen?: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), a[href], select, textarea, [tabindex="0"]';

/**
 * A modal `<dialog>`: the page behind it is inert, Tab stays inside, Esc
 * closes it, and focus returns to where it was when it closes.
 */
export function ModalDialog({
  className,
  label,
  labelledBy,
  onClose,
  closeOnBackdrop = false,
  initialFocus,
  onKeyDown,
  onOpen,
  children,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  // Set on pointer down, so a drag that ends on the backdrop does not close
  const downOnBackdrop = useRef(false);

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!dialog.open) dialog.showModal();
    onOpen?.();
    const first =
      initialFocus?.current ?? dialog.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      dialog.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
    // Focus is placed once, when the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <dialog
      ref={ref}
      className={className}
      aria-label={label}
      aria-labelledby={labelledBy}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== 'Tab') return;
        // Keep Tab inside the dialog instead of escaping to the browser
        const focusable = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
        ].filter((element) => element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      // Esc fires `cancel`; let React own the closing
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        downOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        // The dialog's own box is all backdrop: its content fills it
        if (
          closeOnBackdrop &&
          downOnBackdrop.current &&
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      {children}
    </dialog>
  );
}
