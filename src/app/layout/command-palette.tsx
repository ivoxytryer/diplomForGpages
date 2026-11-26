import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, Users } from 'lucide-react';
import { api } from '@/shared/api';
import { navForRole } from '@/app/navigation';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDebounced, useLookups } from '@/shared/hooks/use-lookups';
import { Dialog } from '@/shared/ui/overlay';
import { Avatar, Spinner } from '@/shared/ui/primitives';
import { fullName } from '@/shared/lib/utils';
import type { Employee } from '@/shared/types';

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term, 250);
  const { departmentById, positionById } = useLookups();

  const employeesQuery = useQuery({
    queryKey: ['command-employees', debounced],
    queryFn: () =>
      api.employees.list({
        search: debounced,
        pageSize: 8,
      }),
    enabled: open && debounced.trim().length >= 2 && user?.role !== 'employee',
  });

  useEffect(() => {
    if (!open) setTerm('');
  }, [open]);

  const navItems = user
    ? navForRole(user.role)
        .flatMap((section) => section.items)
        .filter((item) => item.label.toLowerCase().includes(term.trim().toLowerCase()))
    : [];

  const employees: Employee[] = employeesQuery.data?.items ?? [];

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Dialog open={open} onClose={onClose} title="Быстрый поиск" description="Разделы и сотрудники" size="md">
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <input
          autoFocus
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Начните вводить имя или раздел…"
          className="h-10 w-full rounded-lg bg-surface-2 pl-9 pr-16 text-sm text-fg outline-none transition focus:ring-2 focus:ring-primary/20"
        />
        <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted">
          Esc
        </kbd>
      </div>

      <div className="max-h-[55vh] space-y-4 overflow-y-auto">
        {navItems.length > 0 ? (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Разделы</p>
            <div className="space-y-0.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.to}
                    type="button"
                    onClick={() => go(item.to)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-fg transition hover:bg-surface-2"
                  >
                    <Icon className="size-4 text-muted" />
                    <span className="flex-1">{item.label}</span>
                    <ArrowRight className="size-3.5 text-muted" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {user?.role !== 'employee' && term.trim().length >= 2 ? (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted">
              <Users className="size-3" /> Сотрудники
            </p>
            {employeesQuery.isFetching ? (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            ) : employees.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted">Никого не нашли</p>
            ) : (
              <div className="space-y-0.5">
                {employees.map((employee) => (
                  <button
                    key={employee.id}
                    type="button"
                    onClick={() => go(`/employees/${employee.id}`)}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-surface-2"
                  >
                    <Avatar
                      lastName={employee.lastName}
                      firstName={employee.firstName}
                      middleName={employee.middleName}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">{fullName(employee)}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {positionById.get(employee.positionId)?.name ?? '—'} ·{' '}
                        {departmentById.get(employee.departmentId)?.name ?? '—'}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {term.trim().length === 0 ? (
          <p className="text-center text-[11px] text-muted">
            Введите минимум 2 символа для поиска сотрудников
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
