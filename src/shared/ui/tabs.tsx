import { cn } from '@/shared/lib/utils';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export function Tabs({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex max-w-full items-center gap-0 overflow-x-auto border-b border-border',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[12px] font-medium transition-colors',
              active
                ? 'border-fg text-fg'
                : 'border-transparent text-muted hover:text-fg',
            )}
          >
            {tab.label}
            {tab.count !== undefined ? (
              <span className="text-[10px] tabular-nums text-muted">{tab.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
