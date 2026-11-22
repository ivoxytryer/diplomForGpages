import type { ComponentProps, ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, plural } from '@/shared/lib/utils';
import { Button } from './button';

export function Table({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full border-collapse text-[13px]', className)}>{children}</table>
    </div>
  );
}

export function THead({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <thead className={cn('border-b border-border text-left text-[10px] uppercase tracking-[0.08em] text-muted', className)}>
      {children}
    </thead>
  );
}

export function TBody({ className, children }: { className?: string; children: ReactNode }) {
  return <tbody className={cn('divide-y divide-border', className)}>{children}</tbody>;
}

export function TR({ className, children, ...props }: ComponentProps<'tr'>) {
  return (
    <tr className={cn('transition-colors hover:bg-surface-2/60', className)} {...props}>
      {children}
    </tr>
  );
}

export function TH({ className, children, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn('whitespace-nowrap px-3 py-2.5 font-medium first:pl-4 last:pr-4', className)}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({ className, children, ...props }: ComponentProps<'td'>) {
  return (
    <td className={cn('px-3 py-3 align-middle first:pl-4 last:pr-4', className)} {...props}>
      {children}
    </td>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-[11px] text-muted">
      <div className="flex items-center gap-3">
        <span>
          {from}–{to} из {total}
        </span>
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5">
            <span>На странице</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="border border-border bg-surface px-1.5 py-1 text-[11px] text-fg focus:outline-none"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Предыдущая страница"
        >
          <ChevronLeft />
        </Button>
        <span className="px-2">
          {page} / {pages} {plural(pages, ['страница', 'страницы', 'страниц'])}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pages}
          aria-label="Следующая страница"
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function TableLoader({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-6">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((__, colIndex) => (
            <div
              key={colIndex}
              className="h-8 animate-pulse rounded-md bg-border/50"
              style={{ flex: colIndex === 0 ? 2 : 1 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
