import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BriefcaseBusiness,
  Clock3,
  Plus,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { HrEventType } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups, useManagerDepartmentId } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { eventTypeMeta } from '@/shared/lib/meta';
import { formatDate, fullName, monthKey, monthLabel } from '@/shared/lib/utils';
import { EventForm } from '@/features/events/event-form';
import { MonthSwitcher, PageHeader, SearchInput, StatCard } from '@/shared/ui/page';
import { Avatar, Badge, Card, EmptyState, ErrorState, Select } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';

const eventTypes: HrEventType[] = [
  'hire',
  'transfer',
  'promotion',
  'salary_change',
  'dismissal',
  'vacation',
  'sick_leave',
  'business_trip',
  'unpaid_leave',
];

export function EventsPage() {
  const user = useAuthStore((state) => state.user);
  const managerDepartmentId = useManagerDepartmentId();
  const { employees, departments, positions, employeeById } = useLookups();

  const [month, setMonth] = useState(monthKey());
  const [type, setType] = useState<HrEventType | ''>('');
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const canWrite = can(user?.role, 'events:write');

  const query = useQuery({
    queryKey: ['events', 'page', month, type],
    queryFn: () => api.events.list({ month, type: type || undefined }),
  });

  const scopedDepartments = useMemo(
    () => departments.filter((department) => !managerDepartmentId || department.id === managerDepartmentId),
    [departments, managerDepartmentId],
  );

  const visibleIds = useMemo(() => {
    if (!managerDepartmentId) return null;
    return new Set(
      employees.filter((employee) => employee.departmentId === managerDepartmentId).map((employee) => employee.id),
    );
  }, [employees, managerDepartmentId]);

  const events = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((event) => {
      if (visibleIds && !visibleIds.has(event.employeeId)) return false;
      if (!term) return true;
      const employee = employeeById.get(event.employeeId);
      return [
        fullName(employee),
        event.title,
        event.description ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [query.data, visibleIds, search, employeeById]);

  const stats = {
    total: events.length,
    hired: events.filter((event) => event.type === 'hire').length,
    dismissed: events.filter((event) => event.type === 'dismissal').length,
    moved: events.filter((event) => event.type === 'transfer' || event.type === 'promotion').length,
  };

  const departmentName = (id?: string | null) => (id ? departments.find((item) => item.id === id)?.name ?? id : null);
  const positionName = (id?: string | null) => (id ? positions.find((item) => item.id === id)?.name ?? id : null);

  return (
    <div>
      <PageHeader
        eyebrow="Учёт времени"
        title="Кадровые события"
        description="Приёмы, переводы, повышения, изменения окладов и увольнения"
        actions={
          <>
            <MonthSwitcher value={month} onChange={setMonth} />
            {canWrite ? (
              <Button onClick={() => setFormOpen(true)}>
                <Plus /> Новое событие
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Событий за месяц" value={stats.total} icon={Clock3} tone="info" />
        <StatCard label="Принято" value={stats.hired} icon={UserPlus} tone="success" />
        <StatCard label="Уволено" value={stats.dismissed} icon={UserMinus} tone="danger" />
        <StatCard label="Переводы и повышения" value={stats.moved} icon={BriefcaseBusiness} tone="purple" />
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Поиск по сотруднику или событию…"
            className="min-w-[240px] flex-1"
          />
          <Select
            value={type}
            onChange={(event) => setType(event.target.value as HrEventType | '')}
            className="w-auto min-w-[190px]"
          >
            <option value="">Все типы событий</option>
            {eventTypes.map((item) => (
              <option key={item} value={item}>
                {eventTypeMeta[item].label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} />
      ) : query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-2xl bg-surface" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card>
          <EmptyState
            title="Событий за месяц нет"
            description={`В ${monthLabel(`${month}-01`)} кадровых изменений не зафиксировано.`}
            icon={Clock3}
            action={
              canWrite ? (
                <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
                  <Plus /> Создать событие
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="divide-y divide-border/40">
            {events.map((event) => {
              const employee = employeeById.get(event.employeeId);
              const meta = eventTypeMeta[event.type];
              const fromDepartment = departmentName(event.fromDepartmentId);
              const toDepartment = departmentName(event.toDepartmentId);
              const fromPosition = positionName(event.fromPositionId);
              const toPosition = positionName(event.toPositionId);
              const hasMovement =
                (fromDepartment && toDepartment && fromDepartment !== toDepartment) ||
                (fromPosition && toPosition && fromPosition !== toPosition);

              return (
                <div
                  key={event.id}
                  className="flex flex-wrap items-start gap-4 px-6 py-4 transition hover:bg-surface-2/40"
                >
                  <div className="flex w-full shrink-0 items-center gap-2 sm:w-36 sm:flex-col sm:items-start">
                    <span className="text-[11px] font-semibold tabular-nums text-fg">
                      {formatDate(event.date)}
                    </span>
                    <Badge tone={meta.tone} className="sm:mt-0.5">
                      {meta.label}
                    </Badge>
                  </div>

                  <Link
                    to={`/employees/${event.employeeId}`}
                    className="flex min-w-[200px] flex-1 items-center gap-3"
                  >
                    {employee ? (
                      <Avatar
                        lastName={employee.lastName}
                        firstName={employee.firstName}
                        middleName={employee.middleName}
                        size="sm"
                      />
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium text-fg hover:text-primary">
                        {fullName(employee)}
                      </span>
                      <span className="block truncate text-[11px] text-muted">
                        {employee
                          ? `${departments.find((item) => item.id === employee.departmentId)?.name ?? '—'} · ${
                              positions.find((item) => item.id === employee.positionId)?.name ?? '—'
                            }`
                          : '—'}
                      </span>
                    </span>
                  </Link>

                  <div className="min-w-[260px] flex-[2]">
                    <p className="text-[13px] font-medium text-fg">{event.title}</p>
                    {event.description ? (
                      <p className="mt-0.5 text-[11px] leading-5 text-muted">{event.description}</p>
                    ) : null}
                    {hasMovement ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        {fromDepartment && toDepartment && fromDepartment !== toDepartment ? (
                          <span className="flex items-center gap-1">
                            {fromDepartment} <ArrowRight className="size-3" /> {toDepartment}
                          </span>
                        ) : null}
                        {fromPosition && toPosition && fromPosition !== toPosition ? (
                          <span className="flex items-center gap-1">
                            {fromPosition} <ArrowRight className="size-3" /> {toPosition}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {event.oldSalary && event.newSalary ? (
                      <p className="mt-1 text-[11px] text-muted">
                        Оклад: {event.oldSalary.toLocaleString('ru-RU')} ₽ →{' '}
                        <span className="font-medium text-fg">
                          {event.newSalary.toLocaleString('ru-RU')} ₽
                        </span>
                      </p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-6 py-3 text-[11px] text-muted">
            <span>
              Записей: <span className="font-medium text-fg">{events.length}</span>
            </span>
            {managerDepartmentId ? (
              <span>
                Подразделение:{' '}
                <span className="font-medium text-fg">
                  {departmentName(managerDepartmentId) ?? '—'}
                </span>
              </span>
            ) : (
              <span>Подразделений: {scopedDepartments.length}</span>
            )}
          </div>
        </Card>
      )}

      <EventForm open={formOpen} onClose={() => setFormOpen(false)} />
    </div>
  );
}
