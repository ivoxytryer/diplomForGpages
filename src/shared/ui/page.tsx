import type { ReactNode } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Search, X, type LucideIcon } from 'lucide-react';
import { cn, monthLabel } from '@/shared/lib/utils';
import { Button } from './button';
import { Input } from './primitives';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.025em] text-fg sm:text-[26px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type StatTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple';

export function StatCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: StatTone;
  onClick?: () => void;
}) {
  const Component = onClick ? 'button' : 'div';
  return (
    <Component
      onClick={onClick}
      className={cn(
        'group flex min-h-0 flex-col justify-start border-t border-border bg-transparent pt-2.5 text-left',
        onClick && 'hover:border-fg',
      )}
    >
      <span className="text-[11px] text-muted">{label}</span>
      <span className="mt-1.5 block text-[26px] font-semibold leading-none tracking-[-0.03em] tabular-nums text-fg">
        {value}
      </span>
      {hint ? <span className="mt-1 block text-[11px] leading-4 text-muted">{hint}</span> : null}
    </Component>
  );
}

export function MonthSwitcher({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const shift = (delta: number) => {
    const [year, month] = value.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    onChange(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };
  return (
    <div className={cn('inline-flex items-center gap-0 border border-border bg-surface', className)}>
      <Button
        variant="ghost"
        size="icon-sm"
        className="border-r border-border"
        onClick={() => shift(-1)}
        aria-label="Предыдущий месяц"
      >
        <ChevronLeft />
      </Button>
      <span className="flex min-w-[132px] items-center justify-center gap-1.5 px-2 text-[12px] font-medium capitalize text-fg">
        <CalendarDays className="size-3.5 text-muted" />
        {monthLabel(`${value}-01`)}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        className="border-l border-border"
        onClick={() => shift(1)}
        aria-label="Следующий месяц"
      >
        <ChevronRight />
      </Button>
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Поиск…',
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-fg"
          aria-label="Очистить поиск"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

