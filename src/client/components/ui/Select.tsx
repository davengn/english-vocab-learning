import type { ComponentPropsWithRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@client/lib/utils';
import { FormField, getFieldControlClassName } from '@client/components/ui/Input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  label?: string;
  hint?: string;
  error?: string;
  options?: ReadonlyArray<SelectOption>;
  placeholder?: string;
  wrapperClassName?: string;
}

/**
 * Accessible native <select> control with warm editorial hairline styling and custom chevron.
 */
export function Select({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  required,
  className,
  wrapperClassName,
  'aria-describedby': externalDescribedBy,
  children,
  ...props
}: SelectProps) {
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
        <div className="relative">
          <select
            {...props}
            {...a11yProps}
            required={required}
            className={cn(
              getFieldControlClassName(Boolean(error)),
              'min-h-9 appearance-none pl-3 pr-9 py-2 leading-[1.45]',
              className,
            )}
          >
            {placeholder ? <option value="">{placeholder}</option> : null}
            {options
              ? options.map((opt) => (
                  <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                    {opt.label}
                  </option>
                ))
              : children}
          </select>

          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
            aria-hidden="true"
          />
        </div>
      )}
    </FormField>
  );
}
