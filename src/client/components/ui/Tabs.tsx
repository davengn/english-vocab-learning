import {
  createContext,
  useContext,
  useId,
  useRef,
  useState,
  type ComponentPropsWithRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@client/lib/utils';

export interface TabItem {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
  content?: ReactNode;
}

interface TabsContextValue {
  baseId: string;
  activeValue: string;
  setActiveValue: (value: string) => void;
  activationMode: 'automatic' | 'manual';
  registerTab: (value: string, el: HTMLButtonElement | null) => void;
  getOrderedEnabledValues: () => string[];
  focusTab: (value: string) => void;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext(): TabsContextValue {
  const ctx = useContext(TabsContext);
  if (!ctx) {
    throw new Error('Các thành phần Tabs phải được đặt bên trong <Tabs>.');
  }
  return ctx;
}

export interface TabsProps extends ComponentPropsWithRef<'div'> {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  activationMode?: 'automatic' | 'manual';
  items?: ReadonlyArray<TabItem>;
  ariaLabel?: string;
}

/**
 * Keyboard-accessible tabbed interface with roving tabindex, arrow navigation,
 * and WCAG-compliant underline indicator via CSS pseudo-element.
 */
export function Tabs({
  value,
  defaultValue,
  onValueChange,
  activationMode = 'automatic',
  items,
  ariaLabel = 'Danh sách thẻ',
  className,
  children,
  ...props
}: TabsProps) {
  const baseId = useId();
  const initialValue = defaultValue ?? items?.[0]?.value ?? '';
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const activeValue = value !== undefined ? value : uncontrolledValue;

  const tabElementsRef = useRef<Map<string, HTMLButtonElement>>(new Map());
  const tabOrderRef = useRef<string[]>([]);

  const setActiveValue = (nextValue: string) => {
    if (value === undefined) {
      setUncontrolledValue(nextValue);
    }
    onValueChange?.(nextValue);
  };

  const registerTab = (tabValue: string, el: HTMLButtonElement | null) => {
    if (el) {
      tabElementsRef.current.set(tabValue, el);
      if (!tabOrderRef.current.includes(tabValue)) {
        tabOrderRef.current.push(tabValue);
      }
    } else {
      tabElementsRef.current.delete(tabValue);
      tabOrderRef.current = tabOrderRef.current.filter((v) => v !== tabValue);
    }
  };

  const getOrderedEnabledValues = (): string[] => {
    const ordered = Array.from(tabElementsRef.current.entries())
      .filter(([, el]) => !el.disabled)
      .sort(([, a], [, b]) => {
        const pos = a.compareDocumentPosition(b);
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return 0;
      })
      .map(([v]) => v);
    return ordered;
  };

  const focusTab = (tabValue: string) => {
    const targetEl = tabElementsRef.current.get(tabValue);
    if (!targetEl) return;
    targetEl.focus();
    targetEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <TabsContext.Provider
      value={{
        baseId,
        activeValue,
        setActiveValue,
        activationMode,
        registerTab,
        getOrderedEnabledValues,
        focusTab,
      }}
    >
      <div className={cn('w-full', className)} {...props}>
        {items ? (
          <>
            <TabsList aria-label={ariaLabel}>
              {items.map((item) => (
                <TabsTrigger key={item.value} value={item.value} disabled={item.disabled}>
                  <span>{item.label}</span>
                  {item.badge}
                </TabsTrigger>
              ))}
            </TabsList>
            {items.map((item) =>
              item.content !== undefined ? (
                <TabsContent key={item.value} value={item.value} className="pt-4">
                  {item.content}
                </TabsContent>
              ) : null,
            )}
          </>
        ) : (
          children
        )}
      </div>
    </TabsContext.Provider>
  );
}

export interface TabsListProps extends ComponentPropsWithRef<'div'> {
  'aria-label'?: string;
}

export function TabsList({
  'aria-label': ariaLabel = 'Danh sách thẻ',
  className,
  children,
  ...props
}: TabsListProps) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'flex flex-nowrap items-center gap-1 overflow-x-auto border-b border-[var(--border-hairline)]',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export interface TabsTriggerProps extends Omit<ComponentPropsWithRef<'button'>, 'value'> {
  value: string;
}

export function TabsTrigger({
  value,
  disabled = false,
  className,
  children,
  onClick,
  onKeyDown,
  ...props
}: TabsTriggerProps) {
  const {
    baseId,
    activeValue,
    setActiveValue,
    activationMode,
    registerTab,
    getOrderedEnabledValues,
    focusTab,
  } = useTabsContext();

  const isSelected = activeValue === value;
  const tabId = `${baseId}-tab-${value}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    const enabled = getOrderedEnabledValues();
    if (enabled.length === 0) return;

    const currentIndex = enabled.indexOf(value);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % enabled.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + enabled.length) % enabled.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = enabled.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const nextValue = enabled[nextIndex];
      focusTab(nextValue);
      if (activationMode === 'automatic') {
        setActiveValue(nextValue);
      }
    }
  };

  return (
    <button
      ref={(el) => registerTab(value, el)}
      type="button"
      role="tab"
      id={tabId}
      aria-selected={isSelected}
      tabIndex={isSelected ? 0 : -1}
      disabled={disabled}
      onClick={(e) => {
        setActiveValue(value);
        e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        onClick?.(e);
      }}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex-none inline-flex items-center gap-2 px-3 py-2.5 text-[14px] font-medium whitespace-nowrap transition-colors cursor-pointer',
        'text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] aria-selected:text-[var(--accent)]',
        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] rounded-t-[6px]',
        'disabled:opacity-45 disabled:pointer-events-none',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export interface TabsContentProps extends ComponentPropsWithRef<'div'> {
  value: string;
  keepMounted?: boolean;
}

export function TabsContent({
  value,
  keepMounted = true,
  className,
  children,
  ...props
}: TabsContentProps) {
  const { baseId, activeValue } = useTabsContext();
  const isSelected = activeValue === value;
  const tabId = `${baseId}-tab-${value}`;

  if (!keepMounted && !isSelected) {
    return null;
  }

  return (
    <div
      role="tabpanel"
      aria-labelledby={tabId}
      hidden={!isSelected}
      tabIndex={isSelected ? 0 : undefined}
      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] rounded-[6px]"
      {...props}
    >
      <div className={className}>{children}</div>
    </div>
  );
}
