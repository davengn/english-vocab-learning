import type { ComponentPropsWithRef, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@client/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'subtle' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-white border border-transparent hover:bg-[var(--accent-hover)] active:bg-[#0D4F4A]',
  secondary:
    'bg-[var(--bg-surface)] text-[var(--ink-primary)] border border-[var(--border-hairline)] hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]',
  subtle:
    'bg-[var(--bg-subtle)] text-[var(--ink-primary)] border border-transparent hover:bg-[var(--bg-hover)]',
  ghost:
    'bg-transparent text-[var(--ink-secondary)] border border-transparent hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]',
  danger:
    'bg-[#B91C1C] text-white border border-transparent hover:bg-[#991B1B] active:bg-[#7F1D1D]',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-[8px]',
  md: 'h-9 px-3.5 text-[14px] gap-2 rounded-[8px]',
  lg: 'h-11 px-5 text-[15px] gap-2 rounded-[8px]',
};

/**
 * Editorial button component with restrained slate-teal primary actions and crisp focus-visible outline.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  leftIcon,
  rightIcon,
  className,
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center font-medium leading-none whitespace-nowrap select-none cursor-pointer transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" /> : leftIcon}
      {children}
      {!loading ? rightIcon : null}
    </button>
  );
}
