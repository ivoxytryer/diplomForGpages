import {
  createContext,
  useContext,
  useId,
  type AriaAttributes,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { AlertCircle, Inbox, Loader2, type LucideIcon } from 'lucide-react';
import { cn, getInitials } from '@/shared/lib/utils';
import type { Tone } from '@/shared/lib/meta';
import { Button } from './button';

interface FieldControlContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldControlContext = createContext<FieldControlContextValue | null>(null);

function useFieldControl(props: {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: AriaAttributes['aria-invalid'];
}) {
  const field = useContext(FieldControlContext);
  return {
    id: props.id ?? field?.id,
    'aria-describedby': props['aria-describedby'] ?? field?.describedBy,
    'aria-invalid': props['aria-invalid'] ?? (field?.invalid ? true : undefined),
  };
}

function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    <label
      className={cn('mb-1 block text-[11px] font-medium text-muted', className)}
      {...props}
    />
  );
}

const fieldBase =
  'w-full rounded-none border border-border bg-surface px-2.5 text-[13px] text-fg placeholder:text-muted/70 transition-colors focus:border-fg focus:outline-none focus:ring-1 focus:ring-fg/15 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  const field = useFieldControl(props);
  return <input {...props} {...field} className={cn(fieldBase, 'h-10', className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  const field = useFieldControl(props);
  return (
    <textarea
      {...props}
      {...field}
      className={cn(fieldBase, 'min-h-24 py-2.5', className)}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  const field = useFieldControl(props);
  return (
    <select {...props} {...field} className={cn(fieldBase, 'h-10 pr-8', className)}>
      {children}
    </select>
  );
}

export function Field({
  label,
  error,
  hint,
  className,
  children,
}: {
  label?: string;
  error?: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = !error && hint ? `${id}-hint` : undefined;
  const describedBy = errorId ?? hintId;

  return (
    <div className={className}>
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <FieldControlContext.Provider
        value={{ id, describedBy, invalid: Boolean(error) }}
      >
        {children}
      </FieldControlContext.Provider>
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
      {!error && hint ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ className, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type="checkbox"
      className={cn(
        'size-4 rounded border-border accent-zinc-500 focus:ring-2 focus:ring-primary/30',
        className,
      )}
      {...props}
    />
  );
}

const toneClasses: Record<Tone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-fg',
  neutral: 'text-muted',
  purple: 'text-muted',
  default: 'text-fg',
};

export function Badge({
  tone = 'default',
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap px-0 py-0 text-[10px] font-semibold tracking-[0.02em]',
        toneClasses[tone],
        className,
      )}
    >
      {dot ? <span className="size-1.5 bg-current" /> : null}
      {children}
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('rounded-none border border-border bg-surface', className)}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3',
        className,
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold text-fg">{title}</h3>
        {description ? <p className="mt-0.5 text-[11px] leading-4 text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardContent({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('px-4 pb-4', className)}>{children}</div>;
}

export function Avatar({
  lastName,
  firstName,
  middleName,
  size = 'md',
  className,
}: {
  lastName: string;
  firstName: string;
  middleName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const sizes = {
    xs: 'size-7 text-[10px]',
    sm: 'size-8 text-xs',
    md: 'size-10 text-sm',
    lg: 'size-14 text-base',
    xl: 'size-20 text-xl',
  };
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center border border-border bg-surface-2 text-[11px] font-semibold text-fg',
        sizes[size],
        className,
      )}
      title={`${lastName} ${firstName}`}
    >
      {getInitials(lastName, firstName, middleName)}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-border/60', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-primary', className)} />;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <span className="flex size-10 items-center justify-center border border-border text-muted">
        <Icon className="size-5" />
      </span>
      <div>
        <p className="text-sm font-semibold text-fg">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-xs text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <AlertCircle className="size-8 text-danger" />
      <p className="text-sm font-medium text-fg">Не удалось загрузить данные</p>
      <p className="max-w-sm text-xs text-muted">{message}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-2"
        onClick={() => window.location.reload()}
      >
        Обновить страницу
      </Button>
    </div>
  );
}

const progressTones = {
  primary: 'bg-fg',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function Progress({
  value,
  tone = 'primary',
  className,
}: {
  value: number;
  tone?: keyof typeof progressTones;
  className?: string;
}) {
  return (
    <div className={cn('h-0.5 w-full overflow-hidden bg-border', className)}>
      <div
        className={cn('h-full transition-all', progressTones[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

