import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ClipboardList, Info } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { TimesheetCell, TimesheetCode, TimesheetStatus } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDebounced, useLookups, useManagerDepartmentId } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { timesheetCodeMeta, timesheetCodes, timesheetStatusMeta } from '@/shared/lib/meta';
import {
  datesOfMonth,
  formatDate,
  fullName,
  monthKey,
  plural,
} from '@/shared/lib/utils';
import { getCalendarDay, isCalendarYearSupported, isRedDay } from '@/shared/lib/calendar';
import { MonthSwitcher, PageHeader, SearchInput } from '@/shared/ui/page';
import { Badge, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/overlay';
import { useToast } from '@/shared/ui/toast';

const cellTone: Record<string, string> = {
  success: 'text-success',
  info: 'text-fg',
  danger: 'text-danger',
  purple: 'text-fg',
  warning: 'text-warning',
  neutral: 'text-muted',
  default: 'text-fg',
};

interface CellEditorState {
  employeeId: string;
  employeeName: string;
  date: string;
  cell?: TimesheetCell;
  currentCode: TimesheetCode;
  currentHours: number;
}

export function TimesheetPage() {
  const user = useAuthStore((state) => state.user);
  const managerDepartmentId = useManagerDepartmentId();
  const { employeeById, departmentById, departments } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [month, setMonth] = useState(monthKey());
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 250);
  const [editor, setEditor] = useState<CellEditorState | null>(null);
  const [editorCode, setEditorCode] = useState<TimesheetCode>('Я');
  const [editorHours, setEditorHours] = useState(8);

  const isEmployee = user?.role === 'employee';
  const canEdit = can(user?.role, 'timesheet:edit');
  const canApprove = can(user?.role, 'timesheet:approve');
  const scopedDepartmentId = managerDepartmentId ?? (departmentId || undefined);

  const query = useQuery({
    queryKey: ['timesheet', month, scopedDepartmentId, isEmployee ? user?.employeeId : 'all'],
    queryFn: () =>
      api.timesheet.get({
        month,
        departmentId: scopedDepartmentId,
        employeeId: isEmployee ? (user?.employeeId ?? '') : undefined,
      }),
    enabled: Boolean(user),
  });

  const cellMutation = useMutation({
    mutationFn: (payload: { employeeId: string; date: string; code: TimesheetCode; hours: number }) =>
      api.timesheet.setCell(payload.employeeId, payload.date, {
        code: payload.code,
        hours: payload.hours,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      toast.success('Отметка сохранена');
      setEditor(null);
    },
    onError: (error) => toast.error('Не удалось сохранить отметку', getErrorMessage(error)),
  });

  const statusMutation = useMutation({
    mutationFn: (payload: { employeeId: string; status: TimesheetStatus }) =>
      api.timesheet.setStatus(payload.employeeId, month, payload.status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      toast.success('Статус табеля обновлён');
    },
    onError: (error) => toast.error('Не удалось обновить статус', getErrorMessage(error)),
  });

  useEffect(() => {
    if (!editor) return;
    setEditorCode(editor.currentCode);
    setEditorHours(editor.currentHours);
  }, [editor]);

  const dates = datesOfMonth(month);
  const rows = useMemo(() => {
    const list = query.data?.rows ?? [];
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter((row) => {
      const employee = employeeById.get(row.employeeId);
      return employee ? fullName(employee).toLowerCase().includes(term) : false;
    });
  }, [query.data?.rows, debouncedSearch, employeeById]);

  return (
    <div>
      <PageHeader
        eyebrow="Учёт времени"
        title="Табель"
        description="Отметки присутствия по дням месяца, нормы и итоги"
        actions={<MonthSwitcher value={month} onChange={setMonth} />}
      />

      {!isCalendarYearSupported(Number(month.slice(0, 4))) ? (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-danger/30 px-3 py-2 text-xs leading-5 text-danger">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Производственный календарь на {month.slice(0, 4)} год не настроен. Нормы,
            праздники и переносы могут быть неверными — обновите календарь перед
            утверждением табеля.
          </p>
        </div>
      ) : null}

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder="Поиск сотрудника…" className="min-w-[220px] flex-1" />
          {!managerDepartmentId && !isEmployee ? (
            <Select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="w-auto min-w-[180px]"
            >
              <option value="">Все подразделения</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-muted">
            {timesheetCodes.map((code) => (
              <span key={code} className="flex items-center gap-1">
                <span className={`inline-flex size-5 items-center justify-center rounded text-[10px] font-semibold ${cellTone[timesheetCodeMeta[code].tone]}`}>
                  {code}
                </span>
                {timesheetCodeMeta[code].label}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className={`inline-flex size-5 items-center justify-center rounded text-[10px] font-semibold ${cellTone[timesheetCodeMeta['—'].tone]}`}>
                —
              </span>
              {timesheetCodeMeta['—'].label}
            </span>
            <span className="flex items-center gap-1 text-danger">
              <span className="inline-flex size-5 items-center justify-center rounded border border-danger/30 text-[10px] font-semibold">
                В
              </span>
              праздник
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-flex size-5 items-center justify-center rounded border border-warning/30 text-[10px] font-semibold text-warning">
                −1
              </span>
              сокращённый день
            </span>
          </div>
        </div>
      </Card>

      {isEmployee ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <Info className="size-4 text-primary" />
          Табель доступен в режиме просмотра. Отметки вносит HR или администратор.
        </div>
      ) : null}
      {user?.role === 'hr' ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <Info className="size-4 text-primary" />
          Вы можете править и утверждать табель, но не собственный. После утверждения правки недоступны.
        </div>
      ) : null}
      {user?.role === 'manager' ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <Info className="size-4 text-primary" />
          Свой табель утверждает администратор.
        </div>
      ) : null}
      {managerDepartmentId ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <Info className="size-4 text-primary" />
          Подразделение: <span className="font-medium text-fg">{departmentById.get(managerDepartmentId)?.name}</span>
        </div>
      ) : null}
      {rows.some((row) => row.status === 'approved') ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <Info className="size-4 text-muted" />
          {user?.role === 'admin'
            ? 'Утверждённые табели: правки доступны только администратору и фиксируются в журнале.'
            : 'Утверждённые табели заблокированы для правок. Изменить отметки может администратор или HR после возврата статуса в «Черновик»/«На проверке».'}
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} />
      ) : query.isLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="Нет сотрудников для отображения" icon={ClipboardList} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[calc(100vh-280px)] overflow-auto">
            <table className="w-full min-w-[1180px] border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="sticky left-0 z-30 min-w-[210px] border-b border-border bg-surface-2 px-3 py-2 text-left">
                    Сотрудник
                  </th>
                  {dates.map((date) => {
                    const calendarDay = getCalendarDay(date);
                    const red = isRedDay(date);
                    const weekend = calendarDay.kind === 'weekend';
                    return (
                      <th
                        key={date}
                        className={`border-b border-border px-0.5 py-1 text-center font-semibold ${
                          red
                            ? 'bg-danger/10 text-danger'
                            : weekend
                              ? 'bg-surface-2/80 text-muted/70'
                              : ''
                        }`}
                        title={`${formatDate(date)}${calendarDay.name ? ` · ${calendarDay.name}` : ''}`}
                      >
                        <span className="block">{dayjs(date).format('D')}</span>
                        <span className="block text-[9px] font-normal">{dayjs(date).format('dd')}</span>
                      </th>
                    );
                  })}
                  <th className="border-b border-border px-2 py-2 text-center">Итоги</th>
                  <th className="border-b border-border px-2 py-2 text-left">Статус</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const employee = employeeById.get(row.employeeId);
                  const locked = row.status === 'approved' && user?.role !== 'admin';
                  return (
                    <tr key={row.employeeId} className="hover:bg-surface-2/40">
                      <td className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2">
                        <p className="truncate font-medium text-fg">{fullName(employee)}</p>
                        <p className="truncate text-[10px] text-muted">
                          {departmentById.get(employee?.departmentId ?? '')?.name ?? '—'}
                        </p>
                      </td>
                      {row.days.map((cell) => {
                        const codeMeta = timesheetCodeMeta[cell.code];
                        const outsidePeriod = cell.code === '—';
                        const calendarDay = getCalendarDay(cell.date);
                        const red = isRedDay(cell.date);
                        const weekend = calendarDay.kind === 'weekend';
                        const nonWorking = calendarDay.kind !== 'workday' && calendarDay.kind !== 'shortened' && calendarDay.kind !== 'working_saturday';
                        const editable =
                          canEdit && !outsidePeriod && !locked && (!nonWorking || user?.role === 'admin');
                        return (
                          <td
                            key={cell.date}
                            className={`border-b border-border p-0.5 text-center ${
                              red ? 'bg-danger/5' : weekend ? 'bg-surface-2/50' : ''
                            }`}
                          >
                            <button
                              type="button"
                              disabled={!editable}
                              onClick={() =>
                                setEditor({
                                  employeeId: row.employeeId,
                                  employeeName: fullName(employee),
                                  date: cell.date,
                                  cell,
                                  currentCode: cell.code,
                                  currentHours: cell.hours,
                                })
                              }
                              className={`inline-flex size-7 items-center justify-center rounded text-[10px] font-semibold transition ${
                                red ? 'text-danger' : cellTone[codeMeta.tone]
                              } ${editable ? 'hover:ring-2 hover:ring-primary/30' : 'cursor-default'}`}
                              title={`${formatDate(cell.date)} · ${codeMeta.label}${
                                calendarDay.name ? ` · ${calendarDay.name}` : ''
                              }${outsidePeriod ? ' · вне периода работы' : ''
                              }${locked ? ' · табель утверждён' : ''}${
                                cell.isOverride ? ' · изменено вручную' : ''
                              }`}
                            >
                              {cell.code}
                            </button>
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap border-b border-border px-2 py-1 text-center text-[10px] text-muted">
                        <div className="font-semibold text-fg">{row.totalHours} ч</div>
                        <div>
                          Я {row.workedDays} · ОТ {row.vacationDays} · Б {row.sickDays}
                          {row.tripDays ? ` · К ${row.tripDays}` : ''}
                        </div>
                      </td>
                      <td className="border-b border-border px-2 py-1">
                        {canApprove ? (
                          <select
                            value={row.status}
                            onChange={(event) =>
                              statusMutation.mutate({
                                employeeId: row.employeeId,
                                status: event.target.value as TimesheetStatus,
                              })
                            }
                            className="w-[110px] rounded-md bg-surface-2 px-1.5 py-1 text-[10px] text-fg focus:outline-none"
                          >
                            {Object.entries(timesheetStatusMeta).map(([value, meta]) => (
                              <option
                                key={value}
                                value={value}
                                disabled={
                                  value === 'approved' &&
                                  user?.role !== 'admin' &&
                                  row.employeeId === user?.employeeId
                                }
                              >
                                {meta.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Badge tone={timesheetStatusMeta[row.status].tone}>
                            {timesheetStatusMeta[row.status].label}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted">
            <span>
              Норма месяца: <span className="font-medium text-fg">{query.data?.normDays}</span>{' '}
              {plural(query.data?.normDays ?? 0, ['рабочий день', 'рабочих дня', 'рабочих дней'])}
              {query.data?.normHours ? (
                <>
                  {' '}· <span className="font-medium text-fg">{query.data.normHours} ч</span>
                </>
              ) : null}
            </span>
            <span>
              Сотрудников: <span className="font-medium text-fg">{rows.length}</span>
            </span>
          </div>
        </Card>
      )}

      <Dialog
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title="Отметка в табеле"
        description={editor ? `${editor.employeeName} · ${formatDate(editor.date)}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditor(null)}>
              Отмена
            </Button>
            <Button
              loading={cellMutation.isPending}
              onClick={() => {
                if (!editor) return;
                cellMutation.mutate({
                  employeeId: editor.employeeId,
                  date: editor.date,
                  code: editorCode,
                  hours: editorHours,
                });
              }}
            >
              Сохранить
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Код">
            <Select value={editorCode} onChange={(event) => setEditorCode(event.target.value as TimesheetCode)}>
              {timesheetCodes.map((code) => (
                <option key={code} value={code}>
                  {code} — {timesheetCodeMeta[code].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Часы" hint="Для неявок укажите 0">
            <Input
              type="number"
              min={0}
              max={24}
              value={editorHours}
              onChange={(event) => setEditorHours(Number(event.target.value))}
            />
          </Field>
          <div className="rounded-lg bg-surface-2 p-3 text-[11px] text-muted">
            Изменение сохраняется как ручная отметка и имеет приоритет над отпуском/больничным.
          </div>
        </div>
      </Dialog>
    </div>
  );
}
