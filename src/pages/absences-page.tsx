import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { CalendarDays, CalendarPlus, Check, CheckCheck, List, RotateCcw, X } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Absence, AbsenceStatus } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDebounced, useLookups, useManagerApprovalZone } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { absenceStatusDisplay, absenceTypeMeta } from '@/shared/lib/meta';
import {
  datesOfMonth,
  formatDate,
  fullName,
  monthKey,
  monthLabel,
  plural,
  shortName,
} from '@/shared/lib/utils';
import { getCalendarDay, isRedDay } from '@/shared/lib/calendar';
import { AbsenceForm } from '@/features/absences/absence-form';
import { AbsenceApprovalDialog } from '@/features/absences/absence-approval-dialog';
import { MonthSwitcher, PageHeader, SearchInput } from '@/shared/ui/page';
import { Badge, Card, EmptyState, Skeleton } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { Tabs } from '@/shared/ui/tabs';
import { Select } from '@/shared/ui/primitives';
import { Table, TBody, TD, TH, THead, TR } from '@/shared/ui/table';
import { Dialog } from '@/shared/ui/overlay';
import { useToast } from '@/shared/ui/toast';

const absenceChipTone: Record<string, string> = {
  info: 'text-fg',
  danger: 'text-danger',
  purple: 'text-fg',
  neutral: 'text-muted',
  warning: 'text-warning',
  success: 'text-success',
  default: 'text-fg',
};

export function AbsencesPage() {
  const user = useAuthStore((state) => state.user);
  const { employees, employeeById, departmentById, availableDepartments } = useLookups();
  const approvalZone = useManagerApprovalZone();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusParam = searchParams.get('status');
  const [month, setMonth] = useState(monthKey());
  const [status, setStatus] = useState<AbsenceStatus | ''>(
    statusParam === 'pending' || statusParam === 'approved' || statusParam === 'rejected'
      ? statusParam
      : '',
  );
  const [allMonths, setAllMonths] = useState(searchParams.get('scope') === 'all');
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 250);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [formOpen, setFormOpen] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<Absence | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const isEmployee = user?.role === 'employee';
  const canApprove = can(user?.role, 'absences:approve');
  // Руководитель видит и команды своих проектов, но согласует только свою зону.
  const canApproveAbsence = (absence: Absence) => {
    if (!canApprove) return false;
    if (!approvalZone) return true;
    const employee = employeeById.get(absence.employeeId);
    return Boolean(employee && approvalZone.has(employee.departmentId));
  };
  const canConfirmSick = user?.role === 'admin' || user?.role === 'hr';
  const canCreateAbsence = can(user?.role, 'absences:create');
  const scopedDepartmentId = departmentId || undefined;

  const query = useQuery({
    queryKey: ['absences', allMonths ? 'all' : month, status, isEmployee ? user?.employeeId : 'all'],
    queryFn: () =>
      api.absences.list({
        month: allMonths ? undefined : month,
        status,
        employeeId: isEmployee ? (user?.employeeId ?? '') : undefined,
      }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: AbsenceStatus }) => api.absences.setStatus(id, next),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['vacations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Статус заявки обновлён');
    },
    onError: (error) => toast.error('Не удалось обновить статус', getErrorMessage(error)),
  });

  const requestApproval = (absence: Absence) => {
    setApprovalTarget(absence);
  };

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.absences.setStatus(id, 'approved')),
      );
      return {
        total: ids.length,
        ok: results.filter((result) => result.status === 'fulfilled').length,
      };
    },
    onSuccess: ({ total, ok }) => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['vacations'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setBulkOpen(false);
      if (ok === total) toast.success(`Согласовано заявок: ${ok}`);
      else toast.error(`Согласовано ${ok} из ${total}. Остальные не удалось согласовать.`);
    },
  });

  const visibleEmployees = useMemo(() => {
    if (isEmployee) return employees.filter((employee) => employee.id === user?.employeeId);
    if (scopedDepartmentId) {
      return employees.filter((employee) => employee.departmentId === scopedDepartmentId);
    }
    return employees;
  }, [isEmployee, employees, scopedDepartmentId, user?.employeeId]);

  const visibleIds = useMemo(() => new Set(visibleEmployees.map((employee) => employee.id)), [visibleEmployees]);

  const absences = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return (query.data ?? []).filter((absence) => {
      if (!visibleIds.has(absence.employeeId)) return false;
      if (!term) return true;
      const employee = employeeById.get(absence.employeeId);
      return employee ? fullName(employee).toLowerCase().includes(term) : false;
    });
  }, [query.data, visibleIds, debouncedSearch, employeeById]);

  // Массово согласуем только заявки без активных задач: если задачи есть,
  // по каждой нужно решение «оставить/передать» — такие заявки идут по одной.
  const bulkApprovable = absences.filter(
    (absence) =>
      absence.status === 'pending' &&
      !absence.hasActiveTasks &&
      canApproveAbsence(absence) &&
      (absence.type !== 'sick' || canConfirmSick) &&
      (absence.employeeId !== user?.employeeId || user?.role === 'admin'),
  );

  const dates = datesOfMonth(month);
  const offset = (dayjs(`${month}-01`).day() + 6) % 7;
  // Заявку за другого сотрудника создаёт только admin; остальные — только за себя.
  const formEmployees = (
    user?.role === 'admin'
      ? employees
      : visibleEmployees.filter((employee) => employee.id === user?.employeeId)
  ).filter((employee) => employee.status !== 'dismissed');

  const stats = {
    total: absences.length,
    pending: absences.filter((absence) => absence.status === 'pending').length,
    approved: absences.filter((absence) => absence.status === 'approved').length,
    days: absences.filter((absence) => absence.status === 'approved').reduce((sum, absence) => sum + absence.days, 0),
  };

  return (
    <div>
      <PageHeader
        eyebrow="Учёт времени"
        title="Отсутствия"
        description={
          allMonths
            ? 'Заявки за всё время — примите или отклоните ожидающие'
            : 'Отпуска, больничные, командировки и заявки на согласование'
        }
        actions={
          <>
            {allMonths ? (
              <Button
                variant="outline"
                onClick={() => {
                  setAllMonths(false);
                  const next = new URLSearchParams(searchParams);
                  next.delete('scope');
                  setSearchParams(next, { replace: true });
                }}
              >
                <CalendarDays /> По месяцам
              </Button>
            ) : (
              <MonthSwitcher value={month} onChange={setMonth} />
            )}
            {canApprove && bulkApprovable.length > 0 ? (
              <Button variant="outline" onClick={() => setBulkOpen(true)}>
                <CheckCheck /> Согласовать все ({bulkApprovable.length})
              </Button>
            ) : null}
            {canCreateAbsence ? (
              <Button onClick={() => setFormOpen(true)}>
                <CalendarPlus /> Новая заявка
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted">Всего заявок</p>
            <p className="text-2xl font-semibold text-fg">{stats.total}</p>
          </div>
          <CalendarDays className="size-6 text-muted" />
        </Card>
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted">На согласовании</p>
            <p className="text-2xl font-semibold text-fg">{stats.pending}</p>
          </div>
        </Card>
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted">Согласовано</p>
            <p className="text-2xl font-semibold text-fg">{stats.approved}</p>
          </div>
        </Card>
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-xs text-muted">Дней отсутствия</p>
            <p className="text-2xl font-semibold text-fg">{stats.days}</p>
          </div>
        </Card>
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            tabs={[
              { value: 'list', label: 'Список' },
              { value: 'calendar', label: 'Календарь' },
            ]}
            value={view}
            onChange={(value) => setView(value as 'list' | 'calendar')}
            className="border-0"
          />
          {allMonths ? <Badge tone="neutral">Все месяцы</Badge> : null}
          <div className="mx-2 h-6 w-px bg-border" />
          <SearchInput value={search} onChange={setSearch} placeholder="Поиск сотрудника…" className="min-w-[200px] flex-1" />
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as AbsenceStatus | '')}
            className="w-auto min-w-[170px]"
          >
            <option value="">Все статусы</option>
            <option value="pending">На согласовании</option>
            <option value="approved">Согласовано</option>
            <option value="rejected">Отклонено</option>
          </Select>
          {!isEmployee ? (
            <Select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="w-auto min-w-[170px]"
            >
              <option value="">Все подразделения</option>
              {availableDepartments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      </Card>

      {query.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : view === 'list' ? (
        <Card className="overflow-hidden">
          {absences.length === 0 ? (
            <EmptyState
              title="Заявок нет"
              description={
                allMonths
                  ? 'Заявок с выбранным статусом нет.'
                  : `За ${monthLabel(`${month}-01`)} отсутствий не найдено.`
              }
              icon={List}
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  {!isEmployee ? <TH>Сотрудник</TH> : null}
                  <TH>Тип</TH>
                  <TH>Период</TH>
                  <TH>Дней</TH>
                  <TH>Статус</TH>
                  <TH>Комментарий</TH>
                  {canApprove ? <TH className="text-right">Действия</TH> : null}
                </tr>
              </THead>
              <TBody>
                {absences.map((absence: Absence) => {
                  const employee = employeeById.get(absence.employeeId);
                  const meta = absenceTypeMeta[absence.type];
                  const statusDisplay = absenceStatusDisplay(absence);
                  return (
                    <TR key={absence.id}>
                      {!isEmployee ? (
                        <TD>
                          <p className="text-xs font-medium text-fg">{fullName(employee)}</p>
                          <p className="text-[10px] text-muted">
                            {departmentById.get(employee?.departmentId ?? '')?.name ?? '—'}
                          </p>
                        </TD>
                      ) : null}
                      <TD>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-xs">
                        {formatDate(absence.startDate)} — {formatDate(absence.endDate)}
                      </TD>
                      <TD
                        className="text-xs text-muted"
                        title={`Рабочих: ${absence.workingDays ?? '—'} · календарных: ${absence.calendarDays ?? '—'}`}
                      >
                        {absence.days}
                      </TD>
                      <TD>
                        <Badge tone={statusDisplay.tone}>{statusDisplay.label}</Badge>
                      </TD>
                      <TD className="max-w-[240px] truncate text-xs text-muted">{absence.reason || '—'}</TD>
                      {canApprove ? (
                        <TD>
                          {canApproveAbsence(absence) &&
                          absence.status === 'pending' &&
                          (absence.employeeId !== user?.employeeId || user?.role === 'admin') ? (
                            <div className="flex justify-end gap-1">
                              {absence.type === 'sick' ? (
                                canConfirmSick ? (
                                  <button
                                    type="button"
                                    onClick={() => requestApproval(absence)}
                                    className="inline-flex size-8 items-center justify-center rounded-md text-success transition hover:bg-surface-2"
                                    title="Подтвердить больничный"
                                  >
                                    <Check className="size-4" />
                                  </button>
                                ) : null
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => requestApproval(absence)}
                                    className="inline-flex size-8 items-center justify-center rounded-md text-fg transition hover:bg-surface-2"
                                    title="Согласовать"
                                  >
                                    <Check className="size-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => statusMutation.mutate({ id: absence.id, next: 'rejected' })}
                                    className="inline-flex size-8 items-center justify-center rounded-md text-danger transition hover:bg-red-500/10"
                                    title="Отклонить"
                                  >
                                    <X className="size-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : null}
                          {canApproveAbsence(absence) &&
                          absence.status === 'approved' &&
                          absence.type !== 'sick' &&
                          (absence.employeeId !== user?.employeeId || user?.role === 'admin') ? (
                            <div className="flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => statusMutation.mutate({ id: absence.id, next: 'pending' })}
                                className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
                                title="Вернуть на согласование"
                              >
                                <RotateCcw className="size-4" />
                              </button>
                            </div>
                          ) : null}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
              <div key={day} className="py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: offset }).map((_, index) => (
              <div key={`empty-${index}`} className="min-h-[96px] border-b border-r border-border bg-surface-2/40" />
            ))}
            {dates.map((date) => {
              const calendarDay = getCalendarDay(date);
              const red = isRedDay(date);
              const weekend = calendarDay.kind === 'weekend';
              const dayAbsences = absences.filter(
                (absence) =>
                  absence.status !== 'rejected' &&
                  absence.startDate <= date &&
                  absence.endDate >= date,
              );
              return (
                <div
                  key={date}
                  className={`min-h-[96px] border-b border-r border-border p-1.5 ${
                    red ? 'bg-danger/5' : weekend ? 'bg-surface-2/50' : ''
                  }`}
                  title={calendarDay.name}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={`text-[11px] font-medium ${red ? 'text-danger' : weekend ? 'text-muted' : 'text-fg'}`}>
                      {dayjs(date).format('D')}
                    </span>
                    {dayAbsences.length > 0 ? (
                      <span className="text-[9px] text-muted">{dayAbsences.length}</span>
                    ) : null}
                  </div>
                  <div className="space-y-0.5">
                    {dayAbsences.slice(0, 3).map((absence) => {
                      const employee = employeeById.get(absence.employeeId);
                      const meta = absenceTypeMeta[absence.type];
                      return (
                        <div
                          key={absence.id}
                          className={`truncate rounded px-1 py-0.5 text-[9px] font-medium ${absenceChipTone[meta.tone]}`}
                          title={`${fullName(employee)} · ${meta.label} · ${absenceStatusDisplay(absence).label}`}
                        >
                          {shortName(employee)} · {meta.code}
                        </div>
                      );
                    })}
                    {dayAbsences.length > 3 ? (
                      <p className="text-[9px] text-muted">+{dayAbsences.length - 3}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[11px] text-muted">
            {Object.entries(absenceTypeMeta).map(([type, meta]) => (
              <span key={type} className="flex items-center gap-1">
                <span className={`inline-flex size-4 items-center justify-center rounded text-[9px] font-semibold ${absenceChipTone[meta.tone]}`}>
                  {meta.code}
                </span>
                {meta.label}
              </span>
            ))}
            <span className="ml-auto">
              {absences.length} {plural(absences.length, ['запись', 'записи', 'записей'])}{' '}
              {allMonths ? 'всего' : 'за месяц'}
            </span>
          </div>
        </Card>
      )}

      <Dialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Согласовать заявки"
        description={allMonths ? 'За всё время' : monthLabel(month)}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Отмена
            </Button>
            <Button
              loading={bulkApproveMutation.isPending}
              onClick={() => bulkApproveMutation.mutate(bulkApprovable.map((absence) => absence.id))}
            >
              Согласовать ({bulkApprovable.length})
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm text-muted">
          <p>
            Будет согласовано заявок:{' '}
            <span className="font-medium text-fg">{bulkApprovable.length}</span>.
          </p>
          <p className="rounded-lg bg-surface-2 p-3 text-[11px]">
            Заявки с активными задачами сюда не входят: по ним нужно решить, оставить задачу
            сотруднику или передать коллеге. Такие заявки согласуются по одной.
          </p>
          <p className="text-[11px]">
            Заявки вне вашей зоны ответственности и собственные заявки не затрагиваются.
          </p>
        </div>
      </Dialog>

      <AbsenceForm open={formOpen} onClose={() => setFormOpen(false)} employees={formEmployees} />
      <AbsenceApprovalDialog
        open={Boolean(approvalTarget)}
        absence={approvalTarget}
        onClose={() => setApprovalTarget(null)}
        onApproved={() => setApprovalTarget(null)}
      />
    </div>
  );
}
