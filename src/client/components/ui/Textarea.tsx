import type { ComponentPropsWithRef } from 'react';
import { cn } from '@client/lib/utils';
import { FormField, getFieldControlClassName } from '@client/components/ui/Input';

export interface TextareaProps extends ComponentPropsWithRef<'textarea'> {
  label?: string;
  hint?: string;
  error?: string;
  wrapperClassName?: string;
}

/**
 * Accessible multiline textarea with vertical resize support and warm editorial styling.
 */
export function Textarea({
  id,
  label,
  hint,
  error,
  required,
  rows = 3,
  className,
  wrapperClassName,
  'aria-describedby': externalDescribedBy,
  ...props
}: TextareaProps) {
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
        <textarea
          {...props}
          {...a11yProps}
          rows={rows}
          required={required}
          className={cn(
            getFieldControlClassName(Boolean(error)),
            'px-3 py-2 leading-[1.55] resize-y',
            className,
          )}
        />
      )}
    </FormField>
  );
}
