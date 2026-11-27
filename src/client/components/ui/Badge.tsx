import type { ComponentPropsWithRef } from 'react';
import { cn } from '@client/lib/utils';

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends ComponentPropsWithRef<'span'> {
  tone?: BadgeTone;
  size?: BadgeSize;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--bg-subtle)] text-[var(--ink-secondary)] border-[var(--border-hairline)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]',
  success: 'bg-[var(--success-soft)] text-[var(--success-ink)] border-[var(--success-border)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning-ink)] border-[var(--warning-border)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger-ink)] border-[var(--danger-border)]',
  info: 'bg-[var(--info-soft)] text-[var(--info-ink)] border-[var(--info-border)]',
};

const SIZE_CLASSES: Record<BadgeSize, string> = {
  sm: 'px-2 py-0.5 text-[11px] leading-[1.3]',
  md: 'px-2.5 py-0.5 text-[12px] leading-[1.35]',
};

/**
 * Quiet editorial badge for CEFR levels, part-of-speech labels, SM-2 states, and Vietnamese tags.
 */
export function Badge({ tone = 'neutral', size = 'sm', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[6px] border font-medium whitespace-nowrap',
        TONE_CLASSES[tone],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
