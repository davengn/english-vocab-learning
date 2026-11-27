import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { X } from 'lucide-react';
import { cn } from '@client/lib/utils';
import { Button } from '@client/components/ui/Button';

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

export interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: DialogSize;
  closeOnBackdrop?: boolean;
  dirty?: boolean;
  dirtyConfirmMessage?: string;
  className?: string;
}

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'w-[calc(100vw-2rem)] max-w-[420px]',
  md: 'w-[calc(100vw-2rem)] max-w-[560px]',
  lg: 'w-[calc(100vw-2rem)] max-w-[720px]',
  xl: 'w-[calc(100vw-2rem)] max-w-[920px]',
};

function isOutsideDialogBox(event: PointerEvent<HTMLDialogElement>, dialog: HTMLDialogElement): boolean {
  const rect = dialog.getBoundingClientRect();
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  );
}

/**
 * Native top-layer modal dialog built strictly on <dialog>.showModal() / .close().
 * Guards against accidental backdrop/Esc dismissal when `dirty` is true.
 */
export function Dialog({
  open,
  onOpenChange,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  dirty = false,
  dirtyConfirmMessage = 'Bạn có thay đổi chưa lưu. Bạn chắc chắn muốn đóng và bỏ các thay đổi này?',
  className,
}: DialogProps) {
  const notifyClosed = () => {
    onOpenChange?.(false);
    onClose?.();
  };
  const dialogRef = useRef<HTMLDialogElement>(null);
  const discardButtonRef = useRef<HTMLButtonElement>(null);
  const pressedOutsideRef = useRef(false);

  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);

  const titleId = useId();
  const descriptionId = useId();
  const dirtyMessageId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      const target =
        dialog.querySelector<HTMLElement>(
          '[data-autofocus], [autofocus], [data-dialog-body] input:not([type="hidden"]):not([disabled]), [data-dialog-body] textarea:not([disabled]), [data-dialog-footer] button:not([disabled])',
        );
      if (target) {
        requestAnimationFrame(() => target.focus());
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open || !dirty) {
      setShowDirtyConfirm(false);
    }
  }, [open, dirty]);

  useEffect(() => {
    if (showDirtyConfirm) {
      discardButtonRef.current?.focus();
    }
  }, [showDirtyConfirm]);

  const forceClose = () => {
    setShowDirtyConfirm(false);
    const dialog = dialogRef.current;
    if (dialog && dialog.open) {
      dialog.returnValue = '';
      dialog.close();
      return;
    }
    onOpenChange?.(false);
    onClose?.();
  };

  const requestClose = () => {
    if (dirty) {
      setShowDirtyConfirm(true);
      return;
    }
    forceClose();
  };

  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (dirty) {
      event.preventDefault();
      setShowDirtyConfirm(true);
    }
  };

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    setShowDirtyConfirm(false);
    if (open) {
      notifyClosed();
    }
  };

  const handlePointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    pressedOutsideRef.current = isOutsideDialogBox(event, dialog);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDialogElement>) => {
    const dialog = dialogRef.current;
    const startedOutside = pressedOutsideRef.current;
    pressedOutsideRef.current = false;

    if (!dialog || !startedOutside || !isOutsideDialogBox(event, dialog)) {
      return;
    }

    if (!closeOnBackdrop) return;

    if (dirty) {
      setShowDirtyConfirm(true);
      return;
    }

    if (dialog.open) {
      dialog.close();
    }
  };

  const closedByValue = dirty ? 'none' : closeOnBackdrop ? 'any' : 'closerequest';

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClose={handleClose}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      {...({ closedby: closedByValue } as Record<string, string>)}
      className={cn(
        'p-0 rounded-[10px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)] shadow-[0_12px_32px_rgba(28,25,23,0.12)]',
        SIZE_CLASSES[size],
        className,
      )}
    >
      <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] px-6 py-4">
          <div className="min-w-0">
            <h1
              id={titleId}
              className="text-[17px] font-semibold leading-[1.35] text-[var(--ink-primary)]"
            >
              {title}
            </h1>
            {description ? (
              <p
                id={descriptionId}
                className="mt-1 text-[13px] leading-[1.5] text-[var(--ink-secondary)]"
              >
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={requestClose}
            aria-label="Đóng hộp thoại"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] cursor-pointer"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div data-dialog-body className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {showDirtyConfirm ? (
          <div
            role="status"
            className="border-t border-[var(--warning-border)] bg-[var(--warning-soft)] px-6 py-3.5"
          >
            <p id={dirtyMessageId} className="text-[13px] font-medium text-[var(--warning-ink)]">
              {dirtyConfirmMessage}
            </p>
            <div className="mt-2.5 flex items-center justify-end gap-2">
              <Button
                ref={discardButtonRef}
                variant="danger"
                size="sm"
                aria-describedby={dirtyMessageId}
                onClick={forceClose}
              >
                Hủy thay đổi
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDirtyConfirm(false)}
              >
                Tiếp tục chỉnh sửa
              </Button>
            </div>
          </div>
        ) : null}

        {footer ? (
          <div data-dialog-footer className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/70 px-6 py-3.5">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
