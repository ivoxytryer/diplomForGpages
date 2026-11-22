import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Info,
  ListTodo,
  Plus,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { ProjectTask, ProjectTaskStatus } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDebounced, useLookups } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { isTaskDueToday, isTaskOverdue } from '@/shared/lib/tasks';
import { cn, fullName, todayISO } from '@/shared/lib/utils';
import { TaskForm } from '@/features/tasks/task-form';
import { TaskList } from '@/features/tasks/task-list';
import { useTaskActions } from '@/features/tasks/use-task-actions';
import { PageHeader, SearchInput, StatCard } from '@/shared/ui/page';
import {
  Card,
  CardHeader,
  ErrorState,
  Select,
  Skeleton,
} from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/overlay';

export function TasksPage() {
  const user = useAuthStore((state) => state.user);
  const { employees, projects, employeeById, projectById } = useLookups();
  const { busyId, toggle, postpone, remove } = useTaskActions();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 250);
  const [status, setStatus] = useState<ProjectTaskStatus | ''>('');
  const [projectId, setProjectId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProjectTask | null>(null);
  const [deleting, setDeleting] = useState<ProjectTask | null>(null);

  const isEmployee = user?.role === 'employee';
  const canWrite = can(user?.role, 'tasks:write');
  const canManageTask = (task: ProjectTask) =>
    canWrite &&
    (user?.role === 'admin' ||
      (user?.role === 'manager' &&
        projectById.get(task.projectId)?.managerId === user?.employeeId));
  const today = todayISO();

  const query = useQuery({
    queryKey: ['tasks', { employeeId: isEmployee ? user?.employeeId : employeeId, projectId, status }],
    queryFn: () =>
      api.tasks.list({
        employeeId: isEmployee ? (user?.employeeId ?? '') : employeeId || undefined,
        projectId: projectId || undefined,
        status,
        mine: isEmployee || undefined,
      }),
  });

  const employeeAssignmentsQuery = useQuery({
    queryKey: ['assignments', { employeeId: user?.employeeId }],
    queryFn: () => api.assignments.list({ employeeId: user!.employeeId! }),
    enabled: isEmployee && Boolean(user?.employeeId),
  });
  const projectOptions = useMemo(() => {
    if (!isEmployee) return projects;
    const ids = new Set((employeeAssignmentsQuery.data ?? []).map((item) => item.projectId));
    return projects.filter((project) => ids.has(project.id));
  }, [isEmployee, projects, employeeAssignmentsQuery.data]);

  const tasks = useMemo(() => query.data ?? [], [query.data]);

  const visibleTasks = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return tasks;
    return tasks.filter((task) => {
      const employee = employeeById.get(task.employeeId);
      const project = projectById.get(task.projectId);
      return [task.title, task.description, fullName(employee), project?.name]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [tasks, debouncedSearch, employeeById, projectById]);

  const stats = {
    open: tasks.filter((task) => task.status === 'todo').length,
    overdue: tasks.filter((task) => isTaskOverdue(task, today)).length,
    dueToday: tasks.filter((task) => isTaskDueToday(task, today)).length,
    done: tasks.filter((task) => task.status === 'done').length,
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (task: ProjectTask) => {
    setEditing(task);
    setFormOpen(true);
  };

  const hasFilters = Boolean(search || status || projectId || employeeId);

  return (
    <div>
      <PageHeader
        eyebrow="Проекты"
        title="Задачи"
        description="Задания по проектам: что сделать, к какому сроку и кто ответственный"
        actions={
          canWrite ? (
            <Button onClick={openCreate}>
              <Plus /> Новая задача
            </Button>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="К выполнению"
          value={stats.open}
          hint={`${stats.dueToday} на сегодня`}
          icon={ListTodo}
          tone="primary"
        />
        <StatCard
          label="Просрочено"
          value={stats.overdue}
          hint="требуют внимания"
          icon={AlertTriangle}
          tone={stats.overdue > 0 ? 'danger' : 'success'}
        />
        <StatCard
          label="На сегодня"
          value={stats.dueToday}
          hint="плановый срок"
          icon={CalendarDays}
          tone="warning"
        />
        <StatCard
          label="Выполнено"
          value={stats.done}
          hint="за всё время"
          icon={CheckCircle2}
          tone="success"
        />
      </div>

      <div className="mt-3 space-y-2">
        {isEmployee ? (
          <div className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
            <Info className="size-4 text-primary" />
            Здесь только ваши задачи. Отметьте задачу выполненной или нажмите на календарь,
            если потребовалось больше времени — срок сдвинется на следующий рабочий день.
          </div>
        ) : null}
        {!isEmployee && !canWrite ? (
          <div className="flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
            <Info className="size-4 text-primary" />
            Режим просмотра. Создавать и изменять задачи могут администраторы и руководители.
          </div>
        ) : null}
      </div>

      <Card className="mt-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Поиск по задаче или сотруднику…"
            className="min-w-[220px] flex-1"
          />
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as ProjectTaskStatus | '')}
            className="w-auto min-w-[160px]"
          >
            <option value="">Все статусы</option>
            <option value="todo">К выполнению</option>
            <option value="done">Выполнено</option>
          </Select>
          <Select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="w-auto min-w-[190px]"
          >
            <option value="">Все проекты</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.code} · {project.name}
              </option>
            ))}
          </Select>
          {!isEmployee ? (
            <Select
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="w-auto min-w-[190px]"
            >
              <option value="">Все сотрудники</option>
              {employees
                .filter((employee) => employee.status !== 'dismissed')
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {fullName(employee)}
                  </option>
                ))}
            </Select>
          ) : null}
          {hasFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setStatus('');
                setProjectId('');
                setEmployeeId('');
              }}
            >
              Сбросить
            </Button>
          ) : null}
        </div>
      </Card>

      {query.isError ? (
        <Card className="mt-3">
          <ErrorState message={getErrorMessage(query.error)} />
        </Card>
      ) : query.isLoading ? (
        <Card className="mt-3 p-5">
          <Skeleton className="h-56 w-full" />
        </Card>
      ) : (
        <Card className="mt-3 overflow-hidden">
          <CardHeader
            title="Список задач"
            description={`${visibleTasks.length} из ${tasks.length} · открытых ${stats.open}`}
            actions={
              canWrite ? (
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus /> Добавить
                </Button>
              ) : null
            }
          />
          <TaskList
            tasks={visibleTasks}
            canManage={canWrite}
            canManageTask={canManageTask}
            currentEmployeeId={isEmployee ? user?.employeeId : undefined}
            showEmployee={!isEmployee}
            showProject
            busyId={busyId}
            emptyTitle={hasFilters ? 'Ничего не найдено' : 'Задач пока нет'}
            emptyDescription={
              hasFilters
                ? 'Попробуйте изменить фильтры или строку поиска.'
                : canWrite
                  ? 'Создайте первую задачу для сотрудника, назначенного на проект.'
                  : 'Как только руководитель поставит задачу, она появится здесь.'
            }
            onToggle={(task, done) => toggle.mutate({ task, done })}
            onPostpone={(task) => postpone.mutate(task)}
            onEdit={openEdit}
            onDelete={setDeleting}
          />
        </Card>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3.5 text-muted" /> выполнено
        </span>
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3.5 text-muted" /> перенести на следующий рабочий день
        </span>
        <span className={cn('inline-flex items-center gap-1', stats.overdue > 0 && 'font-medium text-fg')}>
          <AlertTriangle className="size-3.5" /> просрочено: {stats.overdue}
        </span>
      </div>

      <TaskForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        task={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting, {
            onSuccess: () => setDeleting(null),
          })
        }
        title="Удалить задачу?"
        description={deleting?.title}
        loading={remove.isPending}
      />
    </div>
  );
}
