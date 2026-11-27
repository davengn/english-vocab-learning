import type { ComponentPropsWithRef } from 'react';
import { cn } from '@client/lib/utils';

export interface CardProps extends ComponentPropsWithRef<'div'> {
  elevated?: boolean;
}

/**
 * Editorial paper card container with crisp hairline border.
 */
export function Card({ elevated = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]',
        elevated && 'shadow-[0_1px_2px_rgba(28,25,23,0.04)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: ComponentPropsWithRef<'div'>) {
  return (
    <div className={cn('flex flex-col gap-1 px-5 pt-5 pb-3', className)} {...props}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends ComponentPropsWithRef<'h2'> {
  as?: 'h2' | 'h3' | 'h4';
}

export function CardTitle({ as: Tag = 'h2', className, children, ...props }: CardTitleProps) {
  return (
    <Tag
      className={cn(
        'text-[16px] font-semibold leading-[1.4] text-[var(--ink-primary)]',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardDescription({ className, children, ...props }: ComponentPropsWithRef<'p'>) {
  return (
    <p
      className={cn('text-[13px] leading-[1.5] text-[var(--ink-secondary)]', className)}
      {...props}
    >
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: ComponentPropsWithRef<'div'>) {
  return (
    <div className={cn('px-5 pb-5 pt-0 first:pt-5', className)} {...props}>
      {children}
    </div>
  );
}
