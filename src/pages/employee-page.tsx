import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import {
  ArrowLeft,
  CalendarDays,
  CalendarPlus,
  Check,
  GraduationCap,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Plus,
  TrendingUp,
  X,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Absence, HrEventType, ProjectTask } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups, useManagerDepartmentId } from '@/shared/hooks/use-lookups';
import { can, canViewSalary } from '@/shared/lib/permissions';
import {
  absenceStatusDisplay,
  absenceTypeMeta,
  employeeStatusMeta,
  employmentTypeLabels,
  eventTypeMeta,
  projectStatusMeta,
  roleLabels,
  timesheetCodeMeta,
  timesheetStatusMeta,
} from '@/shared/lib/meta';
import { isTaskDueToday, isTaskOverdue } from '@/shared/lib/tasks';
import { buildEmployeeHistory } from '@/shared/lib/employee-history';
import { getCalendarDay, isRedDay } from '@/shared/lib/calendar';
import { isAssignmentActive } from '@/shared/lib/workload';
import {
  ageLabel,
  datesOfMonth,
  formatDate,
  formatMoney,
  fullName,
  monthKey,
  plural,
  todayISO,
} from '@/shared/lib/utils';
import { EmployeeForm } from '@/features/employees/employee-form';
import { AbsenceForm } from '@/features/absences/absence-form';
import { AbsenceApprovalDialog } from '@/features/absences/absence-approval-dialog';
import { EventForm } from '@/features/events/event-form';
import { CreateUserDialog } from '@/features/users/create-user-dialog';
import { VacationBalanceDialog } from '@/features/employees/vacation-balance-dialog';
import { SalaryHistoryChart } from '@/features/employees/salary-history-chart';
import { TaskForm } from '@/features/tasks/task-form';
import { TaskList } from '@/features/tasks/task-list';
import { useTaskActions } from '@/features/tasks/use-task-actions';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader } from '@/shared/ui/page';
import { Avatar, Badge, Card, CardContent, CardHeader, EmptyState, ErrorState, Progress, Skeleton } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { MonthSwitcher } from '@/shared/ui/page';
import { Tabs } from '@/shared/ui/tabs';
import { TBody, TD, TH, THead, TR, Table } from '@/shared/ui/table';
import { useToast } from '@/shared/ui/toast';

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0">
      <span className="shrink-0 text-xs text-muted">{label}</span>
      <span className="text-right text-xs font-medium text-fg">{value}</span>
    </div>
  );
}

export function EmployeePage({ employeeId }: { employeeId?: string } = {}) {
  const params = useParams();
  const id = employeeId ?? params.id;
  const user = useAuthStore((state) => state.user);
  const managerDepartmentId = useManagerDepartmentId();
  const {
    departments,
    positions,
    employees: lookupEmployees,
    departmentById,
    positionById,
    projectById,
    employeeById,
  } = useLookups();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('overview');
  const [month, setMonth] = useState(monthKey());
  const [editOpen, setEditOpen] = useState(false);
  const [absenceOpen, setAbsenceOpen] = useState(false);
  const [approvalTarget, setApprovalTarget] = useState<Absence | null>(null);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [eventType, setEventType] = useState<HrEventType>('promotion');
  const [accountOpen, setAccountOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<ProjectTask | null>(null);
  const { busyId, toggle, postpone, remove } = useTaskActions();

  const canManageAccounts = can(user?.role, 'employees:write');
  const canManageTasks = can(user?.role, 'tasks:write');
  const canManageEvents = can(user?.role, 'events:write');
  const canManageOwnEvents =
    canManageEvents && !(user?.role === 'hr' && id === user.employeeId);

  const employeeQuery = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.employees.get(id!),
    enabled: Boolean(id),
  });

  const absencesQuery = useQuery({
    queryKey: ['absences', { employeeId: id }],
    queryFn: () => api.absences.list({ employeeId: id }),
    enabled: Boolean(id),
  });

  const currentYear = dayjs().year();
  const vacationQuery = useQuery({
    queryKey: ['vacations', id, currentYear],
    queryFn: () => api.vacations.balances({ employeeId: id!, year: currentYear }),
    enabled: Boolean(id),
  });
  const vacationBalance = vacationQuery.data?.find((item) => item.employeeId === id);

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', { employeeId: id }],
    queryFn: () => api.assignments.list({ employeeId: id }),
    enabled: Boolean(id),
  });

  const eventsQuery = useQuery({
    queryKey: ['events', { employeeId: id }],
    queryFn: () => api.events.list({ employeeId: id }),
    enabled: Boolean(id),
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', { employeeId: id }],
    queryFn: () => api.tasks.list({ employeeId: id }),
    enabled: Boolean(id),
  });

  const accountQuery = useQuery({
    queryKey: ['employee-account', id],
    queryFn: () => api.users.getByEmployee(id!),
    enabled: Boolean(id) && canManageAccounts,
  });

  const timesheetQuery = useQuery({
    queryKey: ['timesheet', month, id],
    queryFn: () => api.timesheet.get({ month, employeeId: id }),
    enabled: Boolean(id) && tab === 'timesheet',
  });

  const employee = employeeQuery.data;
  const canSeeSalary = Boolean(employee && canViewSalary(user, employee.id));
  const history = useMemo(
    () =>
      employee
        ? buildEmployeeHistory({
            events: eventsQuery.data ?? [],
            employee,
            departments,
            positions,
            employees: lookupEmployees,
            canViewSalary: canSeeSalary,
          })
        : { entries: [], salarySteps: [] },
    [employee, eventsQuery.data, departments, positions, lookupEmployees, canSeeSalary],
  );

  const statusMutation = useMutation({
    mutationFn: ({ absenceId, status }: { absenceId: string; status: 'approved' | 'rejected' }) =>
      api.absences.setStatus(absenceId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['vacations'] });
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success('Статус заявки обновлён');
    },
    onError: (error) => toast.error('Не удалось обновить статус', getErrorMessage(error)),
  });

  if (!id) {
    return user?.role === 'employee' ? (
      <ErrorState message="Учётная запись не привязана к карточке сотрудника. Обратитесь в HR-отдел." />
    ) : (
      <Navigate to="/employees" replace />
    );
  }
  if (user?.role === 'employee' && user.employeeId !== id) return <Navigate to="/me" replace />;

  if (employeeQuery.isError) return <ErrorState message={getErrorMessage(employeeQuery.error)} />;

  if (employeeQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!employee) return <ErrorState message="Сотрудник не найден" />;

  if (
    user?.role === 'manager' &&
    managerDepartmentId &&
    employee.departmentId !== managerDepartmentId
  ) {
    return <Navigate to="/employees" replace />;
  }

  const canWrite = can(user?.role, 'employees:write');
  const canManageBalance = user?.role === 'admin' || user?.role === 'hr';
  const canCreateAbsence =
    can(user?.role, 'absences:create') && (user?.role === 'admin' || user?.employeeId === id);
  const canApprove = can(user?.role, 'absences:approve');
  const canConfirmSick = user?.role === 'admin' || user?.role === 'hr';
  const department = departmentById.get(employee.departmentId);
  const position = positionById.get(employee.positionId);
  const manager = employee.managerId ? employeeById.get(employee.managerId) : null;
  const managerLabel = manager ? fullName(manager) : employee.managerName ?? '—';
  const meta = employeeStatusMeta[employee.status];
  const absences = absencesQuery.data ?? [];
  const assignments = assignmentsQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const openTasks = tasks.filter((task) => task.status === 'todo');
  const overdueTasks = openTasks.filter((task) => isTaskOverdue(task));
  const todayTasks = openTasks.filter((task) => isTaskDueToday(task));
  const today = todayISO();
  const activeAssignments = assignments.filter((assignment) =>
    isAssignmentActive(assignment, projectById.get(assignment.projectId), today),
  );
  const canCreateTask =
    canManageTasks && employee.status !== 'dismissed' && activeAssignments.length > 0;
  const totalAllocation = activeAssignments.reduce(
    (sum, assignment) => sum + assignment.allocation,
    0,
  );
  const yearAbsences = absences.filter(
    (absence) => absence.status === 'approved' && absence.startDate.startsWith(String(dayjs().year())),
  );
  const vacationDays = yearAbsences
    .filter((absence) => absence.type === 'vacation' || absence.type === 'study')
    .reduce((sum, absence) => sum + absence.days, 0);
  const sickDays = yearAbsences
    .filter((absence) => absence.type === 'sick')
    .reduce((sum, absence) => sum + absence.days, 0);

  const tabs = [
    { value: 'overview', label: 'Обзор' },
    { value: 'timesheet', label: 'Табель' },
    { value: 'absences', label: 'Отпуска', count: absences.length },
    { value: 'projects', label: 'Проекты', count: assignments.length },
    { value: 'tasks', label: 'Задачи', count: openTasks.length },
    { value: 'history', label: 'История', count: events.length },
  ];

  const timesheetRow = timesheetQuery.data?.rows[0];
  const monthDates = datesOfMonth(month);
  const firstDay = dayjs(`${month}-01`);
  const offset = (firstDay.day() + 6) % 7;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {user?.role !== 'employee' ? (
          <Link
            to="/employees"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-fg"
          >
            <ArrowLeft className="size-3.5" /> К списку сотрудников
          </Link>
        ) : (
          <span className="text-xs text-muted">Личная карточка</span>
        )}
      </div>

      <PageHeader
        title={fullName(employee)}
        description={`${position?.name ?? '—'} · ${department?.name ?? '—'}`}
        actions={
          <>
            {canManageOwnEvents && employee.status !== 'dismissed' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEventType('transfer');
                    setEventOpen(true);
                  }}
                >
                  <TrendingUp /> Перевод
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEventType('promotion');
                    setEventOpen(true);
                  }}
                >
                  <TrendingUp /> Повышение
                </Button>
              </>
            ) : null}
            {user?.role === 'admin' && employee.status !== 'dismissed' ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEventType('dismissal');
                  setEventOpen(true);
                }}
              >
                <X /> Уволить
              </Button>
            ) : null}
            {canCreateAbsence && employee.status !== 'dismissed' ? (
              <Button variant="outline" onClick={() => setAbsenceOpen(true)}>
                <CalendarPlus /> Заявка на отсутствие
              </Button>
            ) : null}
            {canWrite ? (
              <Button onClick={() => setEditOpen(true)}>
                <Pencil /> Редактировать
              </Button>
            ) : null}
          </>
        }
      />

      {employee.status === 'dismissed' ? (
        <div className="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-sm text-muted">
          Сотрудник уволен {formatDate(employee.dismissalDate)}. Карточка доступна в режиме просмотра.
        </div>
      ) : null}
      {user?.role === 'hr' && id === user.employeeId ? (
        <div className="mb-4 rounded-lg bg-surface-2 px-4 py-3 text-xs text-muted">
          Свою должность, перевод и оклад оформляет администратор. Личные данные можно
          редактировать самостоятельно.
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center">
          <Avatar
            lastName={employee.lastName}
            firstName={employee.firstName}
            middleName={employee.middleName}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[17px] font-semibold text-fg">{fullName(employee)}</h2>
              <Badge tone={meta.tone} dot>
                {meta.label}
              </Badge>
              <span className="text-[11px] text-muted">Табельный № {employee.personnelNumber}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5" /> {employee.email}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" /> {employee.phone}
              </span>
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-3.5" /> с {formatDate(employee.hireDate)}
              </span>
            </div>
          </div>
          <div className="border-t border-border pt-2 text-left sm:ml-auto sm:border-0 sm:pt-0 sm:text-right">
            <p className="text-[10px] uppercase tracking-[0.06em] text-muted">Загрузка проектами</p>
            <p className="text-lg font-semibold text-fg">{totalAllocation}%</p>
          </div>
        </div>
      </Card>

      <div className="mt-4">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>

      {tab === 'overview' ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader title="Личные данные" />
              <CardContent className="py-2">
                <InfoRow label="Дата рождения" value={`${formatDate(employee.birthDate)} (${ageLabel(employee.birthDate)})`} />
                <InfoRow label="Пол" value={employee.gender === 'male' ? 'Мужской' : 'Женский'} />
                <InfoRow label="Телефон" value={employee.phone} />
                <InfoRow label="Email" value={employee.email} />
                <InfoRow
                  label="Образование"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <GraduationCap className="size-3.5 text-muted" />
                      {employee.education || '—'}
                    </span>
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Занятость" />
              <CardContent className="py-2">
                <InfoRow label="Подразделение" value={department?.name ?? '—'} />
                <InfoRow label="Должность" value={position?.name ?? '—'} />
                <InfoRow label="Руководитель" value={managerLabel} />
                <InfoRow label="Дата приёма" value={formatDate(employee.hireDate)} />
                <InfoRow label="Тип занятости" value={employmentTypeLabels[employee.employmentType]} />
                <InfoRow label="Статус" value={<Badge tone={meta.tone}>{meta.label}</Badge>} />
                {canViewSalary(user, employee.id) ? (
                  <InfoRow label="Оклад" value={formatMoney(employee.salary)} />
                ) : null}
              </CardContent>
            </Card>

            {canManageAccounts ? (
              <Card>
                <CardHeader
                  title="Доступ в систему"
                  description="Учётная запись для входа в портал"
                  actions={
                    accountQuery.data ? (
                      <Badge tone={accountQuery.data.isActive ? 'success' : 'neutral'} dot>
                        {accountQuery.data.isActive ? 'Активен' : 'Заблокирован'}
                      </Badge>
                    ) : null
                  }
                />
                <CardContent className="py-2">
                  {accountQuery.isLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : accountQuery.data ? (
                    <>
                      <InfoRow label="Email" value={accountQuery.data.email} />
                      <InfoRow
                        label="Роль"
                        value={<Badge tone="info">{roleLabels[accountQuery.data.role]}</Badge>}
                      />
                      <InfoRow
                        label="Пароль"
                        value={
                          accountQuery.data.mustChangePassword ? (
                            <Badge tone="warning">Требуется смена</Badge>
                          ) : (
                            'Изменён пользователем'
                          )
                        }
                      />
                      <InfoRow
                        label="Последний вход"
                        value={
                          accountQuery.data.lastLoginAt
                            ? formatDate(accountQuery.data.lastLoginAt)
                            : 'Ещё не входил'
                        }
                      />
                    </>
                  ) : (
                    <div className="space-y-3 py-2">
                      <p className="text-xs text-muted">
                        {employee.status === 'dismissed'
                          ? 'Сотрудник уволен — доступ в систему не создаётся.'
                          : 'У сотрудника нет учётной записи. Вход в систему невозможен.'}
                      </p>
                      {employee.status !== 'dismissed' ? (
                        <Button size="sm" onClick={() => setAccountOpen(true)}>
                          <KeyRound /> Создать учётную запись
                        </Button>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader title="Отпуска и больничные" description={`За ${dayjs().year()} год`} />
              <CardContent className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px] text-muted">Дней отпуска</p>
                    <p className="text-2xl font-semibold text-fg">
                      {vacationBalance?.used ?? vacationDays}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-muted">Дней больничного</p>
                    <p className="text-2xl font-semibold text-fg">{sickDays}</p>
                  </div>
                </div>
                <Progress
                  value={Math.min(
                    100,
                    ((vacationBalance?.used ?? vacationDays) /
                      Math.max(1, (vacationBalance?.entitlement ?? 28) + (vacationBalance?.carryover ?? 0))) *
                      100,
                  )}
                  tone="primary"
                />
                <p className="text-[11px] text-muted">
                  Использовано {vacationBalance?.used ?? vacationDays} из{' '}
                  {vacationBalance?.entitlement ?? 28} дней
                  {vacationBalance?.carryover ? ` + ${vacationBalance.carryover} перенос` : ''}
                </p>
                <p className="text-[11px] text-muted">
                  Остаток: <span className="font-medium text-fg">{vacationBalance?.remaining ?? 28}</span>
                  {' '}· запланировано: {vacationBalance?.planned ?? 0}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Проекты" description={`${assignments.length} назначений`} />
              <CardContent className="space-y-3">
                {assignments.length === 0 ? (
                  <p className="text-xs text-muted">Сотрудник не назначен на проекты.</p>
                ) : (
                  assignments.slice(0, 4).map((assignment) => {
                    const project = projectById.get(assignment.projectId);
                    return (
                      <div key={assignment.id}>
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-fg">{project?.name ?? '—'}</span>
                          <span className="shrink-0 text-muted">{assignment.allocation}%</span>
                        </div>
                        <Progress className="mt-1" value={assignment.allocation} tone={assignment.allocation > 50 ? 'warning' : 'primary'} />
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader
                title="Задачи"
                description={`${openTasks.length} открытых · ${tasks.length} всего`}
                actions={
                  canCreateTask ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingTask(null);
                        setTaskOpen(true);
                      }}
                    >
                      <Plus /> Задача
                    </Button>
                  ) : null
                }
              />
              <CardContent className="space-y-3">
                {tasksQuery.isLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : tasks.length === 0 ? (
                  <p className="text-xs text-muted">
                    {canCreateTask
                      ? 'Задач пока нет — поставьте первую задачу по проекту.'
                      : 'Задач по проектам пока нет.'}
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={overdueTasks.length > 0 ? 'danger' : 'neutral'}>
                        Просрочено: {overdueTasks.length}
                      </Badge>
                      <Badge tone="warning">На сегодня: {todayTasks.length}</Badge>
                      <Badge tone="success">Выполнено: {tasks.length - openTasks.length}</Badge>
                    </div>
                    <div className="space-y-2 border-t border-border pt-3">
                      {openTasks.slice(0, 3).map((task) => {
                        const project = projectById.get(task.projectId);
                        return (
                          <div key={task.id} className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium text-fg">{task.title}</p>
                              <p className="truncate text-[10px] text-muted">
                                {project?.code ?? '—'} · до {formatDate(task.dueDate)}
                              </p>
                            </div>
                            {isTaskOverdue(task) ? <Badge tone="danger">Просрочено</Badge> : null}
                          </div>
                        );
                      })}
                    </div>
                    <Link
                      to="/tasks"
                      className="inline-flex text-xs font-medium text-primary transition hover:underline"
                    >
                      Все задачи →
                    </Link>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === 'timesheet' ? (
        <Card className="mt-4">
          <CardHeader
            title="Табель за месяц"
            description="Отметки явок, отпусков, больничных и командировок"
            actions={<MonthSwitcher value={month} onChange={setMonth} />}
          />
          {timesheetQuery.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-56 w-full" />
            </div>
          ) : !timesheetRow ? (
            <EmptyState
              title="Нет данных табеля"
              description="За выбранный месяц строки табеля не найдены. Возможно, сотрудник ещё не оформлен или уволен."
            />
          ) : (
            <CardContent>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {timesheetRow.status ? (
                  <Badge tone={timesheetStatusMeta[timesheetRow.status].tone}>
                    {timesheetStatusMeta[timesheetRow.status].label}
                  </Badge>
                ) : null}
                <span className="text-xs text-muted">
                  Норма: {timesheetRow.normDays} {plural(timesheetRow.normDays, ['день', 'дня', 'дней'])} ·
                  отработано {timesheetRow.workedDays} · отпуск {timesheetRow.vacationDays} · больничный{' '}
                  {timesheetRow.sickDays} · командировка {timesheetRow.tripDays}
                </span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
                  <div key={day} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {day}
                  </div>
                ))}
                {Array.from({ length: offset }).map((_, index) => (
                  <div key={`empty-${index}`} />
                ))}
                {monthDates.map((date) => {
                  const cell = timesheetRow.days.find((item) => item.date === date);
                  const code = cell?.code ?? 'В';
                  const codeMeta = timesheetCodeMeta[code];
                  const calendarDay = getCalendarDay(date);
                  const red = isRedDay(date);
                  const weekend = calendarDay.kind === 'weekend';
                  return (
                    <div
                      key={date}
                      className={`rounded-lg border p-1.5 text-center ${
                        red
                          ? 'border-danger/30 bg-danger/5'
                          : weekend
                            ? 'border-border/50 bg-surface-2/60'
                            : 'border-border bg-surface'
                      }`}
                      title={`${formatDate(date)} — ${codeMeta.label}${calendarDay.name ? ` (${calendarDay.name})` : ''}${cell?.hours ? `, ${cell.hours} ч` : ''}`}
                    >
                      <p className={`text-[10px] ${red ? 'text-danger' : 'text-muted'}`}>{dayjs(date).format('D')}</p>
                      <Badge tone={codeMeta.tone} className="mt-1 px-1.5 py-0 text-[10px]">
                        {codeMeta.short}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          )}
        </Card>
      ) : null}

      {tab === 'absences' ? (
        <>
        <Card className="mt-4">
          <CardHeader
            title={`Остаток отпуска · ${currentYear}`}
            description="Положено, использовано, запланировано и остаток в календарных днях"
            actions={
              canManageBalance ? (
                <Button size="sm" variant="outline" onClick={() => setBalanceOpen(true)}>
                  Изменить
                </Button>
              ) : null
            }
          />
          <CardContent className="grid gap-3 py-4 sm:grid-cols-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Положено</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {vacationBalance?.entitlement ?? 28}
              </p>
              {vacationBalance?.carryover ? (
                <p className="text-[10px] text-muted">+{vacationBalance.carryover} перенос</p>
              ) : null}
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Использовано</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {vacationBalance?.used ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Запланировано</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
                {vacationBalance?.planned ?? 0}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">Остаток</p>
              <p
                className={`mt-1 text-2xl font-semibold tabular-nums ${
                  (vacationBalance?.remaining ?? 28) < 0 ? 'text-danger' : 'text-fg'
                }`}
              >
                {vacationBalance?.remaining ?? 28}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="mt-3 overflow-hidden">
          <CardHeader
            title="Отпуска и отсутствия"
            description={`${absences.length} ${plural(absences.length, ['запись', 'записи', 'записей'])}`}
            actions={
              canCreateAbsence && employee.status !== 'dismissed' ? (
                <Button size="sm" onClick={() => setAbsenceOpen(true)}>
                  <Plus /> Добавить
                </Button>
              ) : null
            }
          />
          {absences.length === 0 ? (
            <EmptyState title="Записей нет" description="Отпуска, больничные и командировки появятся здесь." icon={CalendarDays} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Тип</TH>
                  <TH>Период</TH>
                  <TH>Дней</TH>
                  <TH>Статус</TH>
                  <TH>Комментарий</TH>
                  {canApprove ? <TH className="text-right">Действия</TH> : null}
                </tr>
              </THead>
              <TBody>
                {absences.map((absence) => (
                  <TR key={absence.id}>
                    <TD>
                      <Badge tone={absenceTypeMeta[absence.type].tone}>{absenceTypeMeta[absence.type].label}</Badge>
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
                      <Badge tone={absenceStatusDisplay(absence).tone}>
                        {absenceStatusDisplay(absence).label}
                      </Badge>
                    </TD>
                    <TD className="max-w-[220px] truncate text-xs text-muted">{absence.reason || '—'}</TD>
                    {canApprove ? (
                      <TD>
                        {absence.status === 'pending' &&
                        (absence.employeeId !== user?.employeeId || user?.role === 'admin') ? (
                          <div className="flex justify-end gap-1">
                            {absence.type === 'sick' ? (
                              canConfirmSick ? (
                                <button
                                  type="button"
                                  onClick={() => setApprovalTarget(absence)}
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
                                  onClick={() => setApprovalTarget(absence)}
                                  className="inline-flex size-8 items-center justify-center rounded-md text-fg transition hover:bg-surface-2"
                                  title="Согласовать"
                                >
                                  <Check className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => statusMutation.mutate({ absenceId: absence.id, status: 'rejected' })}
                                  className="inline-flex size-8 items-center justify-center rounded-md text-danger transition hover:bg-red-500/10"
                                  title="Отклонить"
                                >
                                  <X className="size-4" />
                                </button>
                              </>
                            )}
                          </div>
                        ) : null}
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </Card>
        </>
      ) : null}

      {tab === 'projects' ? (
        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs text-muted">
              Суммарная загрузка: <span className="font-semibold text-fg">{totalAllocation}%</span>
            </p>
            {totalAllocation > 100 ? <Badge tone="danger">Перегрузка</Badge> : null}
          </div>
          {assignments.length === 0 ? (
            <Card>
              <EmptyState title="Нет назначений на проекты" description="Добавьте сотрудника в команду проекта." />
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {assignments.map((assignment) => {
                const project = projectById.get(assignment.projectId);
                return (
                  <Card key={assignment.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          to={`/projects/${assignment.projectId}`}
                          className="truncate text-sm font-semibold text-fg hover:text-primary"
                        >
                          {project?.name ?? '—'}
                        </Link>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {project?.code ?? ''} · {assignment.projectRole}
                        </p>
                      </div>
                      {project ? (
                        <Badge tone={projectStatusMeta[project.status].tone}>
                          {projectStatusMeta[project.status].label}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <Progress value={assignment.allocation} tone={assignment.allocation > 50 ? 'warning' : 'primary'} />
                      <span className="shrink-0 text-xs font-semibold text-fg">{assignment.allocation}%</span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted">
                      {formatDate(assignment.startDate)} —{' '}
                      {assignment.endDate ? formatDate(assignment.endDate) : 'бессрочно'}
                    </p>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {tab === 'tasks' ? (
        <Card className="mt-4 overflow-hidden">
          <CardHeader
            title="Задачи по проектам"
            description={`${openTasks.length} открытых · ${tasks.length} всего`}
            actions={
              canCreateTask ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingTask(null);
                    setTaskOpen(true);
                  }}
                >
                  <Plus /> Добавить задачу
                </Button>
              ) : null
            }
          />
          {tasksQuery.isLoading ? (
            <div className="p-5">
              <Skeleton className="h-40 w-full" />
            </div>
          ) : tasksQuery.isError ? (
            <ErrorState message={getErrorMessage(tasksQuery.error)} />
          ) : (
            <TaskList
              tasks={tasks}
              canManage={canManageTasks}
              currentEmployeeId={user?.role === 'employee' ? user.employeeId : undefined}
              showProject
              busyId={busyId}
              emptyTitle="Задач пока нет"
              emptyDescription={
                activeAssignments.length === 0
                  ? 'Сотрудник не назначен на активные проекты — сначала добавьте его в команду.'
                  : canCreateTask
                    ? 'Поставьте первую задачу по одному из проектов сотрудника.'
                    : 'Руководитель ещё не поставил задачи.'
              }
              onToggle={(task, done, comment) => toggle.mutate({ task, done, comment })}
              onPostpone={(task) => postpone.mutate(task)}
              onEdit={(task) => {
                setEditingTask(task);
                setTaskOpen(true);
              }}
              onDelete={setDeletingTask}
            />
          )}
        </Card>
      ) : null}

      {tab === 'history' ? (
        <Card className="mt-4">
          <CardHeader
            title="История должностей и окладов"
            description={`${history.entries.length} записей`}
            actions={
              canManageEvents ? (
                <Button variant="outline" size="sm" onClick={() => setEventOpen(true)}>
                  <Plus /> Событие
                </Button>
              ) : null
            }
          />
          <CardContent className="pt-3">
            {canSeeSalary && history.salarySteps.length ? (
              <div className="mb-5 border-b border-border pb-4">
                <div className="mb-2 flex items-baseline justify-between gap-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                    Динамика оклада
                  </p>
                  <p className="text-xs font-semibold tabular-nums text-fg">
                    {formatMoney(employee.salary)}
                  </p>
                </div>
                <SalaryHistoryChart steps={history.salarySteps} />
              </div>
            ) : null}

            {history.entries.length === 0 ? (
              <EmptyState
                title="История пока пуста"
                description="Кадровые события появятся здесь после приёма, перевода, повышения или изменения оклада."
              />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>Дата</TH>
                    <TH>Событие</TH>
                    <TH>Подразделение</TH>
                    <TH>Должность</TH>
                    <TH>Грейд</TH>
                    {canSeeSalary ? <TH className="text-right">Оклад</TH> : null}
                    <TH>Автор</TH>
                  </tr>
                </THead>
                <TBody>
                  {history.entries.map((entry) => {
                    const eventMeta = eventTypeMeta[entry.type];
                    const departmentLabel =
                      entry.fromDepartmentName &&
                      entry.toDepartmentName &&
                      entry.fromDepartmentName !== entry.toDepartmentName
                        ? `${entry.fromDepartmentName} → ${entry.toDepartmentName}`
                        : entry.toDepartmentName ?? entry.fromDepartmentName ?? '—';
                    const positionLabel =
                      entry.fromPositionName &&
                      entry.toPositionName &&
                      entry.fromPositionName !== entry.toPositionName
                        ? `${entry.fromPositionName} → ${entry.toPositionName}`
                        : entry.toPositionName ?? entry.fromPositionName ?? '—';
                    const gradeLabel =
                      entry.fromGrade &&
                      entry.toGrade &&
                      entry.fromGrade !== entry.toGrade
                        ? `${entry.fromGrade} → ${entry.toGrade}`
                        : entry.grade ?? entry.toGrade ?? entry.fromGrade ?? '—';
                    const salaryLabel =
                      entry.newSalary === null || entry.newSalary === undefined
                        ? '—'
                        : entry.oldSalary !== null &&
                            entry.oldSalary !== undefined &&
                            entry.oldSalary !== entry.newSalary
                          ? `${formatMoney(entry.oldSalary)} → ${formatMoney(entry.newSalary)}`
                          : formatMoney(entry.newSalary);

                    return (
                      <TR key={entry.id}>
                        <TD className="whitespace-nowrap text-xs tabular-nums">
                          {formatDate(entry.date)}
                        </TD>
                        <TD className="min-w-[180px]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-medium text-fg">{entry.title}</span>
                            <Badge tone={eventMeta.tone}>{eventMeta.label}</Badge>
                          </div>
                          {entry.description ? (
                            <p className="mt-0.5 max-w-[360px] text-[11px] leading-4 text-muted">
                              {entry.description}
                            </p>
                          ) : null}
                        </TD>
                        <TD className="text-xs text-muted">{departmentLabel}</TD>
                        <TD className="text-xs text-muted">{positionLabel}</TD>
                        <TD className="whitespace-nowrap text-xs tabular-nums text-muted">
                          {gradeLabel}
                        </TD>
                        {canSeeSalary ? (
                          <TD className="whitespace-nowrap text-right text-xs tabular-nums text-fg">
                            {salaryLabel}
                          </TD>
                        ) : null}
                        <TD className="whitespace-nowrap text-xs text-muted">
                          {entry.authorName ?? '—'}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : null}

      <AbsenceApprovalDialog
        open={Boolean(approvalTarget)}
        absence={approvalTarget}
        onClose={() => setApprovalTarget(null)}
        onApproved={() => setApprovalTarget(null)}
      />
      <EmployeeForm open={editOpen} onClose={() => setEditOpen(false)} employee={employee} />
      <EventForm
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        defaultEmployeeId={employee.id}
        defaultType={eventType}
        lockEmployee
      />
      <AbsenceForm
        open={absenceOpen}
        onClose={() => setAbsenceOpen(false)}
        defaultEmployeeId={employee.id}
        employees={[employee]}
      />
      <VacationBalanceDialog
        open={balanceOpen}
        onClose={() => setBalanceOpen(false)}
        employeeId={employee.id}
        year={currentYear}
        balance={vacationBalance}
      />
      {accountOpen ? (
        <CreateUserDialog
          open={accountOpen}
          onClose={() => setAccountOpen(false)}
          employees={[employee]}
          allowedRoles={
            user?.role === 'admin'
              ? ['employee', 'manager', 'hr', 'admin']
              : ['employee']
          }
        />
      ) : null}

      <TaskForm
        open={taskOpen}
        onClose={() => {
          setTaskOpen(false);
          setEditingTask(null);
        }}
        employeeId={employee.id}
        task={editingTask}
      />

      <ConfirmDialog
        open={Boolean(deletingTask)}
        onClose={() => setDeletingTask(null)}
        onConfirm={() =>
          deletingTask &&
          remove.mutate(deletingTask, {
            onSuccess: () => setDeletingTask(null),
          })
        }
        title="Удалить задачу?"
        description={deletingTask?.title}
        loading={remove.isPending}
      />
    </div>
  );
}
