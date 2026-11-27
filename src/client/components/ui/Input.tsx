import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';
import { cn } from '@client/lib/utils';

export interface FormFieldProps {
  id?: string;
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  externalDescribedBy?: string;
  wrapperClassName?: string;
  children: (a11yProps: {
    id: string;
    'aria-invalid': true | undefined;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}

/**
 * Shared accessible control surface classes for Input, Textarea, and Select.
 */
export function getFieldControlClassName(hasError: boolean): string {
  return cn(
    'w-full rounded-[8px] border bg-[var(--bg-surface)] text-[16px] sm:text-[14px] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] transition-colors',
    hasError
      ? 'border-[var(--danger-ink)] focus:border-[var(--danger-ink)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--danger-ink)]'
      : 'border-[var(--border-strong)] hover:border-[#A8A29E] focus:border-[var(--accent)] focus:outline-2 focus:outline-offset-0 focus:outline-[var(--accent)]',
    'disabled:cursor-not-allowed disabled:bg-[var(--bg-subtle)] disabled:text-[var(--ink-muted)]',
  );
}

/**
 * Shared accessible field wrapper pairing <label>, hint, control, and error message via IDs.
 */
export function FormField({
  id,
  label,
  hint,
  error,
  required,
  externalDescribedBy,
  wrapperClassName,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const errorId = `${fieldId}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null, externalDescribedBy ?? null]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', wrapperClassName)}>
      {label ? (
        <label
          htmlFor={fieldId}
          className="text-[13px] font-medium leading-[1.4] text-[var(--ink-primary)]"
        >
          {label}
          {required ? (
            <span className="ml-0.5 text-[var(--danger-ink)]" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      {hint ? (
        <p id={hintId} className="text-[12px] leading-[1.4] text-[var(--ink-muted)]">
          {hint}
        </p>
      ) : null}

      {children({
        id: fieldId,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
      })}

      {error ? (
        <p id={errorId} role="alert" className="text-[12px] leading-[1.4] text-[var(--danger-ink)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface InputProps extends ComponentPropsWithRef<'input'> {
  label?: string;
  hint?: string;
  error?: string;
  leftIcon?: ReactNode;
  rightElement?: ReactNode;
  wrapperClassName?: string;
}

/**
 * Accessible single-line text input with warm editorial border, focus ring, hint, and error state.
 */
export function Input({
  id,
  label,
  hint,
  error,
  leftIcon,
  rightElement,
  required,
  className,
  wrapperClassName,
  'aria-describedby': externalDescribedBy,
  ...props
}: InputProps) {
  return (
    <FormField
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      externalDescribedBy={externalDescribedBy}
      wrapperClassName={wrapperClassName}
    >
      {(a11yProps) => (
        <div className="relative flex items-center">
          {leftIcon ? (
            <span
              className="pointer-events-none absolute left-3 flex items-center text-[var(--ink-muted)]"
              aria-hidden="true"
            >
              {leftIcon}
            </span>
          ) : null}

          <input
            {...props}
            {...a11yProps}
            required={required}
            className={cn(
              getFieldControlClassName(Boolean(error)),
              'min-h-9 px-3 py-2 leading-[1.45]',
              Boolean(leftIcon) && 'pl-9',
              Boolean(rightElement) && 'pr-9',
              className,
            )}
          />

          {rightElement ? (
            <div className="absolute right-2 flex items-center">{rightElement}</div>
          ) : null}
        </div>
      )}
    </FormField>
  );
}
