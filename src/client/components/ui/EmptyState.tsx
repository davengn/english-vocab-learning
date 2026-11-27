import type { ReactNode } from 'react';
import { BookOpen } from 'lucide-react';
import { cn } from '@client/lib/utils';
import { Button } from '@client/components/ui/Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  description?: string;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

/**
 * Calm editorial empty state with Vietnamese defaults and optional action CTA.
 */
export function EmptyState({
  icon,
  title = 'Chưa có dữ liệu',
  description = 'Hãy thêm mục mới để bắt đầu xây dựng hệ thống học tập của bạn.',
  action,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--bg-surface)] px-6 py-10 text-center',
        className,
      )}
    >
      <div
        className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-subtle)] text-[var(--ink-muted)]"
        aria-hidden="true"
      >
        {icon ?? <BookOpen className="h-5 w-5" />}
      </div>

      <h3 className="text-[15px] font-semibold leading-[1.4] text-[var(--ink-primary)]">
        {title}
      </h3>

      {description ? (
        <p className="mt-1.5 max-w-md text-[14px] leading-[1.6] text-[var(--ink-secondary)]">
          {description}
        </p>
      ) : null}

      {action ? (
        <div className="mt-5">{action}</div>
      ) : actionLabel && onAction ? (
        <div className="mt-5">
          <Button variant="primary" size="md" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
