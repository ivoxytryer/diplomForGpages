import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  CalendarRange,
  FolderKanban,
  Gauge,
  Pencil,
  Plus,
  Users,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { ProjectTask } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { findEmployeeAbsenceNote, formatAbsenceNote } from '@/shared/lib/absences';
import { projectStatusMeta } from '@/shared/lib/meta';
import { formatDate, fullName, todayISO } from '@/shared/lib/utils';
import { isAssignmentActive } from '@/shared/lib/workload';
import { AssignmentForm } from '@/features/projects/assignment-form';
import { ProjectForm } from '@/features/projects/project-form';
import { TaskForm } from '@/features/tasks/task-form';
import { TaskList } from '@/features/tasks/task-list';
import { useTaskActions } from '@/features/tasks/use-task-actions';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { PageHeader, StatCard } from '@/shared/ui/page';
import {
  Avatar,
  Badge,
  Card,
  CardContent,
  CardHeader,
  EmptyState,
  ErrorState,
  Progress,
  Skeleton,
} from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { TBody, TD, TH, THead, TR, Table } from '@/shared/ui/table';

export function ProjectPage() {
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const { employeeById, departmentById } = useLookups();
  const [editOpen, setEditOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProjectTask | null>(null);
  const [deletingTask, setDeletingTask] = useState<ProjectTask | null>(null);
  const { busyId, toggle, postpone, remove } = useTaskActions();

  const projectQuery = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.projects.get(id!),
    enabled: Boolean(id),
  });

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', { projectId: id }],
    queryFn: () => api.assignments.list({ projectId: id }),
    enabled: Boolean(id),
  });

  const tasksQuery = useQuery({
    queryKey: ['tasks', { projectId: id }],
    queryFn: () => api.tasks.list({ projectId: id }),
    enabled: Boolean(id),
  });

  const absencesQuery = useQuery({
    queryKey: ['absences', 'project-team'],
    queryFn: () => api.absences.list({}),
    enabled: Boolean(id),
  });

  const canWrite = can(user?.role, 'projects:write');

  if (!id) return null;
  if (projectQuery.isError) return <ErrorState message={getErrorMessage(projectQuery.error)} />;

  const project = projectQuery.data;
  if (!project) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const manager = project.managerId ? employeeById.get(project.managerId) : null;
  const isProjectManager = Boolean(
    user?.employeeId && project.managerId === user.employeeId,
  );
  const isAdminOrHr = user?.role === 'admin' || user?.role === 'hr';
  const canEditProject = canWrite && (isAdminOrHr || isProjectManager);
  const canManageTeam =
    can(user?.role, 'projects:manage-team') && (isAdminOrHr || isProjectManager);
  const canManageProjectTasks =
    can(user?.role, 'tasks:write') && (user?.role === 'admin' || isProjectManager);
  // Manager видит каталог всех проектов, но детали чужих проектов скрыты.
  const isForeignManagerView = user?.role === 'manager' && !isProjectManager;
  const canViewTeamDetails = !isForeignManagerView;
  const assignments = canViewTeamDetails ? (assignmentsQuery.data ?? []) : [];
  const today = todayISO();
  const activeAssignments = assignments.filter((assignment) =>
    isAssignmentActive(assignment, project, today),
  );
  const totalAllocation = activeAssignments.reduce((sum, assignment) => sum + assignment.allocation, 0);
  const teamSize = new Set(activeAssignments.map((assignment) => assignment.employeeId)).size;
  const avgAllocation = teamSize ? Math.round(totalAllocation / teamSize) : 0;
  const editingAssignment = assignments.find((assignment) => assignment.id === editingAssignmentId) ?? null;
  const projectTasks = canViewTeamDetails ? (tasksQuery.data ?? []) : [];
  const openTasks = projectTasks.filter((task) => task.status === 'todo').length;

  return (
    <div>
      <div className="mb-3">
        <Link
          to="/projects"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted transition hover:text-fg"
        >
          <ArrowLeft className="size-3.5" /> К списку проектов
        </Link>
      </div>

      <PageHeader
        eyebrow={`Проект · ${project.code}`}
        title={
          <span className="inline-flex items-center gap-2.5">
            <span className="inline-block size-3 rounded-full bg-zinc-500/40" />
            {project.name}
          </span>
        }
        description={project.description || 'Описание проекта не заполнено'}
        actions={
          <>
            {canViewTeamDetails ? (
              <Link
                to={`/reports?report=projectTeams&project=${project.id}`}
                className="inline-flex h-9 items-center gap-2 border border-border bg-surface px-3 text-xs font-medium text-fg transition-colors hover:border-fg"
              >
                <BarChart3 className="size-4" /> Отчёт по проекту
              </Link>
            ) : null}
            {canManageTeam ? (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingAssignmentId(null);
                  setAssignmentOpen(true);
                }}
              >
                <Plus /> Добавить участника
              </Button>
            ) : null}
            {canEditProject ? (
              <Button onClick={() => setEditOpen(true)}>
                <Pencil /> Редактировать
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Статус" value={projectStatusMeta[project.status].label} icon={FolderKanban} tone="info" />
        <StatCard
          label="Участников"
          value={canViewTeamDetails ? teamSize : '—'}
          hint={
            canViewTeamDetails
              ? `${assignments.length} назначений`
              : 'доступно руководителю проекта'
          }
          icon={Users}
          tone="success"
        />
        <StatCard
          label="Суммарная загрузка"
          value={canViewTeamDetails ? `${totalAllocation}%` : '—'}
          icon={Gauge}
          tone="purple"
        />
        <StatCard
          label="Средняя загрузка"
          value={canViewTeamDetails ? `${avgAllocation}%` : '—'}
          icon={Gauge}
          tone="warning"
        />
      </div>
      {!canViewTeamDetails ? (
        <div className="mt-3 border border-border bg-surface-2/50 px-4 py-3 text-xs text-muted">
          Вы не являетесь руководителем этого проекта. Доступны только основные параметры;
          команда и задачи доступны руководителю проекта.
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Параметры проекта" />
            <CardContent className="space-y-3 text-xs">
              <div>
                <p className="text-muted">Руководитель</p>
                {manager ? (
                  <Link
                    to={`/employees/${manager.id}`}
                    className="mt-1 flex items-center gap-2 text-fg hover:text-primary"
                  >
                    <Avatar lastName={manager.lastName} firstName={manager.firstName} size="xs" />
                    <span>
                      <span className="block font-medium">{fullName(manager)}</span>
                      <span className="block text-[10px] text-muted">
                        {departmentById.get(manager.departmentId)?.name ?? '—'}
                      </span>
                    </span>
                  </Link>
                ) : project.managerName ? (
                  <div className="mt-1">
                    <p className="font-medium text-fg">{project.managerName}</p>
                    <p className="text-[10px] text-muted">Карточка сотрудника недоступна</p>
                  </div>
                ) : (
                  <p className="mt-1 font-medium text-fg">Не назначен</p>
                )}
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-muted">Период</p>
                <p className="mt-1 flex items-center gap-1.5 font-medium text-fg">
                  <CalendarRange className="size-3.5 text-muted" />
                  {formatDate(project.startDate)} —{' '}
                  {project.endDate ? formatDate(project.endDate) : 'бессрочно'}
                </p>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-muted">Код проекта</p>
                <p className="mt-1 font-mono text-xs text-fg">{project.code}</p>
              </div>
            </CardContent>
          </Card>

          {canViewTeamDetails ? (
            <Card>
              <CardHeader title="Загрузка команды" description="Распределение процентов" />
              <CardContent className="space-y-2.5">
                {assignments.length === 0 ? (
                  <p className="text-xs text-muted">Нет назначений.</p>
                ) : (
                  assignments
                    .slice()
                    .sort((a, b) => b.allocation - a.allocation)
                    .map((assignment) => {
                      const employee = employeeById.get(assignment.employeeId);
                      return (
                        <div key={assignment.id}>
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="truncate text-fg">{fullName(employee)}</span>
                            <span className="shrink-0 font-medium text-muted">
                              {assignment.allocation}%
                            </span>
                          </div>
                          <Progress
                            className="mt-1"
                            value={assignment.allocation}
                            tone={assignment.allocation > 60 ? 'warning' : 'primary'}
                          />
                        </div>
                      );
                    })
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>

        {canViewTeamDetails ? (
        <Card className="overflow-hidden">
          <CardHeader
            title="Команда проекта"
            description={`${teamSize} участников · суммарная загрузка ${totalAllocation}%`}
            actions={
              canManageTeam ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingAssignmentId(null);
                    setAssignmentOpen(true);
                  }}
                >
                  <Plus /> Участник
                </Button>
              ) : null
            }
          />
          {assignments.length === 0 ? (
            <EmptyState
              title="В команде пока никого нет"
              description="Добавьте сотрудников на проект, чтобы учитывать их загрузку."
              icon={Users}
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Сотрудник</TH>
                  <TH>Роль в проекте</TH>
                  <TH>Загрузка</TH>
                  <TH>Период</TH>
                  <TH className="w-24 text-right">Действия</TH>
                </tr>
              </THead>
              <TBody>
                {assignments.map((assignment) => {
                  const employee = employeeById.get(assignment.employeeId);
                  const absence = employee
                    ? findEmployeeAbsenceNote(
                        absencesQuery.data ?? [],
                        employee.id,
                        today,
                      )
                    : null;
                  return (
                    <TR key={assignment.id}>
                      <TD>
                        <Link
                          to={`/employees/${assignment.employeeId}`}
                          className="flex items-center gap-2"
                        >
                          {employee ? (
                            <Avatar
                              lastName={employee.lastName}
                              firstName={employee.firstName}
                              size="xs"
                            />
                          ) : null}
                          <span className="min-w-0">
                            <span className="block truncate text-xs font-medium text-fg hover:text-primary">
                              {fullName(employee)}
                            </span>
                            <span className="block truncate text-[10px] text-muted">
                              {employee ? departmentById.get(employee.departmentId)?.name ?? '—' : '—'}
                            </span>
                            {absence ? (
                              <span className="block text-[10px] text-muted">
                                {formatAbsenceNote(absence)}
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </TD>
                      <TD className="text-xs text-muted">{assignment.projectRole}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <Progress
                            className="w-20"
                            value={assignment.allocation}
                            tone={assignment.allocation > 60 ? 'warning' : 'primary'}
                          />
                          <span className="text-xs font-medium text-fg">{assignment.allocation}%</span>
                        </div>
                      </TD>
                      <TD className="whitespace-nowrap text-[11px] text-muted">
                        {formatDate(assignment.startDate)} —{' '}
                        {assignment.endDate ? formatDate(assignment.endDate) : 'бессрочно'}
                      </TD>
                      <TD>
                        {canManageTeam ? (
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAssignmentId(assignment.id);
                                setAssignmentOpen(true);
                              }}
                              className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
                              title="Изменить назначение"
                            >
                              <Pencil className="size-4" />
                            </button>
                          </div>
                        ) : null}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-2.5 text-[11px] text-muted">
            <span>Всего назначений: {assignments.length}</span>
            {totalAllocation > 100 * Math.max(teamSize, 1) ? (
              <Badge tone="danger">Возможна перегрузка</Badge>
            ) : (
              <Badge tone="success">Загрузка в норме</Badge>
            )}
          </div>
        </Card>
        ) : (
          <Card>
            <CardHeader title="Команда проекта" description="Доступ ограничен" />
            <EmptyState
              title="Команда скрыта"
              description="Состав команды доступен руководителю проекта и HR/администратору."
              icon={Users}
            />
          </Card>
        )}
      </div>

      {canViewTeamDetails ? (
      <Card className="mt-4 overflow-hidden">
        <CardHeader
          title="Задачи проекта"
          description={`${openTasks} открытых · ${projectTasks.length} всего`}
          actions={
            canManageProjectTasks && project.status !== 'completed' ? (
              <Button
                size="sm"
                variant="outline"
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
        {tasksQuery.isLoading ? (
          <div className="p-5">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : tasksQuery.isError ? (
          <ErrorState message={getErrorMessage(tasksQuery.error)} />
        ) : (
          <TaskList
            tasks={projectTasks}
            canManage={canManageProjectTasks}
            currentEmployeeId={user?.role === 'employee' ? user.employeeId : undefined}
            showEmployee
            busyId={busyId}
            emptyTitle="Задач по проекту нет"
            emptyDescription={
              project.status === 'completed'
                ? 'Проект завершён, новые задачи не создаются.'
                : canManageProjectTasks
                  ? 'Поставьте первую задачу участнику команды.'
                  : 'Руководитель ещё не поставил задачи по этому проекту.'
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
        {project.status === 'completed' ? (
          <div className="border-t border-border px-5 py-2.5 text-[11px] text-muted">
            Проект завершён — создание новых задач недоступно.
          </div>
        ) : null}
      </Card>
      ) : (
        <Card className="mt-4">
          <CardHeader title="Задачи проекта" description="Доступ ограничен" />
          <EmptyState
            title="Задачи скрыты"
            description="Задачи доступны руководителю проекта и участникам команды."
          />
        </Card>
      )}

      <ProjectForm open={editOpen} onClose={() => setEditOpen(false)} project={project} />
      <AssignmentForm
        open={assignmentOpen}
        onClose={() => {
          setAssignmentOpen(false);
          setEditingAssignmentId(null);
        }}
        projectId={project.id}
        assignment={editingAssignment}
      />

      <TaskForm
        open={taskOpen}
        onClose={() => {
          setTaskOpen(false);
          setEditingTask(null);
        }}
        projectId={project.id}
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
