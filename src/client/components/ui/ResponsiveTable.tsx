import type { ReactNode } from 'react';
import { cn } from '@client/lib/utils';
import { EmptyState } from '@client/components/ui/EmptyState';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  width?: string;
  headerClassName?: string;
  cellClassName?: string;
  isRowHeader?: boolean;
  render: (row: T, index: number) => ReactNode;
}

export interface ResponsiveTableProps<T> {
  ariaLabel: string;
  caption?: string;
  columns: ReadonlyArray<ResponsiveTableColumn<T>>;
  data: ReadonlyArray<T>;
  getRowKey: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  emptyState?: ReactNode;
  className?: string;
  tableClassName?: string;
  maxHeight?: string;
}

export interface ResponsiveTableRegionProps {
  ariaLabel: string;
  maxHeight?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Keyboard-scrollable region wrapper for custom semantic <table> markup.
 */
export function ResponsiveTableRegion({
  ariaLabel,
  maxHeight,
  className,
  children,
}: ResponsiveTableRegionProps) {
  return (
    <div
      tabIndex={0}
      role="region"
      aria-label={ariaLabel}
      style={maxHeight ? { maxBlockSize: maxHeight } : undefined}
      className={cn(
        'responsive-table-wrapper rounded-[8px] border border-[var(--border-hairline)] bg-[var(--bg-surface)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Accessible semantic <table> inside a container-query scroll region.
 * Sticky column headers on desktop; collapses into scannable stacked cards below 640px.
 */
export function ResponsiveTable<T>({
  ariaLabel,
  caption,
  columns,
  data,
  getRowKey,
  onRowClick,
  emptyState,
  className,
  tableClassName,
  maxHeight,
}: ResponsiveTableProps<T>) {
  if (data.length === 0) {
    return (
      <>
        {emptyState ?? (
          <EmptyState
            title="Chưa có dữ liệu"
            description="Không tìm thấy bản ghi nào phù hợp với bộ lọc hiện tại."
          />
        )}
      </>
    );
  }

  return (
    <ResponsiveTableRegion ariaLabel={ariaLabel} maxHeight={maxHeight} className={className}>
      <table
        className={cn(
          'w-full text-left text-[13px] leading-[1.45] text-[var(--ink-primary)]',
          tableClassName,
        )}
      >
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="bg-[var(--bg-subtle)] text-[12px] font-medium text-[var(--ink-secondary)]">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                style={col.width ? { width: col.width } : undefined}
                className={cn(
                  'border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5 whitespace-nowrap',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  col.headerClassName,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => {
            const isLastRow = rowIndex === data.length - 1;
            return (
              <tr
                key={getRowKey(row, rowIndex)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'group transition-colors hover:bg-[#F8F7F4]',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((col, colIndex) => {
                  const isRowHeader = col.isRowHeader ?? colIndex === 0;
                  const cellBorderClass = !isLastRow
                    ? 'border-b border-[var(--border-hairline)]'
                    : '';

                  if (isRowHeader) {
                    return (
                      <th
                        key={col.key}
                        scope="row"
                        data-label={col.header}
                        className={cn(
                          'bg-[var(--bg-surface)] px-3.5 py-3 text-left font-medium text-[var(--ink-primary)] transition-colors group-hover:bg-[#F8F7F4]',
                          cellBorderClass,
                          col.cellClassName,
                        )}
                      >
                        {col.render(row, rowIndex)}
                      </th>
                    );
                  }

                  return (
                    <td
                      key={col.key}
                      data-label={col.header}
                      className={cn(
                        'px-3.5 py-3 text-[var(--ink-secondary)]',
                        cellBorderClass,
                        col.align === 'right' && 'text-right',
                        col.align === 'center' && 'text-center',
                        col.cellClassName,
                      )}
                    >
                      {col.render(row, rowIndex)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </ResponsiveTableRegion>
  );
}
