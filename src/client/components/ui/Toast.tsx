import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '@client/lib/utils';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'error';

export interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastItem extends ToastInput {
  id: string;
  tone: Exclude<ToastTone, 'error'>;
  durationMs: number;
}

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<Exclude<ToastTone, 'error'>, string> = {
  neutral: 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)]',
  success: 'border-[var(--success-border)] bg-[var(--bg-surface)] text-[var(--ink-primary)]',
  warning: 'border-[var(--warning-border)] bg-[var(--bg-surface)] text-[var(--ink-primary)]',
  danger: 'border-[var(--danger-border)] bg-[var(--bg-surface)] text-[var(--ink-primary)]',
  info: 'border-[var(--info-border)] bg-[var(--bg-surface)] text-[var(--ink-primary)]',
};

function ToastIcon({ tone }: { tone: Exclude<ToastTone, 'error'> }) {
  switch (tone) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--success-ink)]" aria-hidden="true" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--warning-ink)]" aria-hidden="true" />;
    case 'danger':
      return <AlertCircle className="h-4 w-4 shrink-0 text-[var(--danger-ink)]" aria-hidden="true" />;
    case 'info':
      return <Info className="h-4 w-4 shrink-0 text-[var(--info-ink)]" aria-hidden="true" />;
    default:
      return <Info className="h-4 w-4 shrink-0 text-[var(--ink-muted)]" aria-hidden="true" />;
  }
}

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

function ToastCard({ item, onDismiss }: ToastCardProps) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || item.durationMs <= 0 || !Number.isFinite(item.durationMs)) {
      return;
    }
    const timer = window.setTimeout(() => {
      onDismiss(item.id);
    }, item.durationMs);

    return () => window.clearTimeout(timer);
  }, [item.id, item.durationMs, onDismiss, paused]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
      className={cn(
        'pointer-events-auto flex w-full max-w-[360px] items-start gap-2.5 rounded-[10px] border px-3.5 py-3 shadow-[0_6px_20px_rgba(28,25,23,0.08)]',
        TONE_STYLES[item.tone],
      )}
    >
      <div className="pt-0.5">
        <ToastIcon tone={item.tone} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-[1.4] text-[var(--ink-primary)]">
          {item.title}
        </p>
        {item.description ? (
          <p className="mt-0.5 text-[12px] leading-[1.45] text-[var(--ink-secondary)]">
            {item.description}
          </p>
        ) : null}
        {item.action ? (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss(item.id);
            }}
            className="mt-1.5 text-[12px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] cursor-pointer"
          >
            {item.action.label}
          </button>
        ) : null}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Đóng thông báo"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] cursor-pointer"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Context provider rendering a non-blocking bottom-right toast stack using native popover="manual"
 * (with fixed-position baseline) and a permanently-mounted polite ARIA live region.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const regionRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const toast = useCallback((input: ToastInput): string => {
    counterRef.current += 1;
    const id = `toast-${Date.now()}-${counterRef.current}`;
    const normalizedTone: Exclude<ToastTone, 'error'> =
      input.tone === 'error' ? 'danger' : (input.tone ?? 'neutral');

    const item: ToastItem = {
      ...input,
      id,
      tone: normalizedTone,
      durationMs: input.durationMs ?? 4000,
    };

    setToasts((prev) => [...prev.slice(-4), item]);
    setLiveAnnouncement(
      input.description ? `${input.title}. ${input.description}` : input.title,
    );

    return id;
  }, []);

  const success = useCallback(
    (title: string, description?: string) => toast({ title, description, tone: 'success' }),
    [toast],
  );
  const error = useCallback(
    (title: string, description?: string) => toast({ title, description, tone: 'danger' }),
    [toast],
  );
  const warning = useCallback(
    (title: string, description?: string) => toast({ title, description, tone: 'warning' }),
    [toast],
  );
  const info = useCallback(
    (title: string, description?: string) => toast({ title, description, tone: 'info' }),
    [toast],
  );

  useEffect(() => {
    const el = regionRef.current as (HTMLDivElement & {
      showPopover?: () => void;
      hidePopover?: () => void;
      matches?: (selector: string) => boolean;
    }) | null;
    if (!el || typeof el.showPopover !== 'function' || typeof el.hidePopover !== 'function') {
      return;
    }

    try {
      const isOpen = el.matches?.(':popover-open') ?? false;
      if (toasts.length > 0 && !isOpen) {
        el.showPopover();
      } else if (toasts.length === 0 && isOpen) {
        el.hidePopover();
      }
    } catch {
      // Ignore transient popover state transitions during mount/unmount
    }
  }, [toasts.length]);

  const value = useMemo<ToastContextValue>(
    () => ({ toast, success, error, warning, info, dismiss, dismissAll }),
    [toast, success, error, warning, info, dismiss, dismissAll],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Permanently mounted polite live region for reliable screen reader announcements */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveAnnouncement}
      </div>

      <div
        ref={regionRef}
        role="region"
        aria-label="Thông báo"
        {...({ popover: 'manual' } as Record<string, string>)}
        className={cn(
          'toast-region pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2',
          toasts.length === 0 && 'hidden',
        )}
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Access non-blocking Vietnamese toast notifications from any client component inside ToastProvider.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() phải được sử dụng bên trong <ToastProvider>.');
  }
  return ctx;
}
