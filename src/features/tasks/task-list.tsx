import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  CalendarDays,
  Check,
  Clock3,
  ListTodo,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { ProjectTask } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups } from '@/shared/hooks/use-lookups';
import { isTaskOverdue } from '@/shared/lib/tasks';
import { taskStatusMeta } from '@/shared/lib/meta';
import { cn, formatDate, fullName, todayISO } from '@/shared/lib/utils';
import { Badge, EmptyState, Field, Textarea } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { Dialog } from '@/shared/ui/overlay';

interface TaskListProps {
  tasks: ProjectTask[];
  canManage: boolean;
  canManageTask?: (task: ProjectTask) => boolean;
  currentEmployeeId?: string | null;
  showEmployee?: boolean;
  showProject?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  busyId?: string | null;
  onToggle?: (task: ProjectTask, done: boolean, comment?: string) => void;
  onPostpone?: (task: ProjectTask) => void;
  onEdit?: (task: ProjectTask) => void;
  onDelete?: (task: ProjectTask) => void;
}

export function TaskList({
  tasks,
  canManage,
  canManageTask,
  currentEmployeeId,
  showEmployee = false,
  showProject = false,
  emptyTitle = 'Задач пока нет',
  emptyDescription = 'Новые задачи появятся здесь.',
  busyId,
  onToggle,
  onPostpone,
  onEdit,
  onDelete,
}: TaskListProps) {
  const { employeeById, projectById } = useLookups();
  const role = useAuthStore((state) => state.user?.role);
  const canOpenCards = role !== 'employee';
  const today = todayISO();
  const [completing, setCompleting] = useState<ProjectTask | null>(null);
  const [result, setResult] = useState('');

  if (tasks.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} icon={ListTodo} />;
  }

  return (
    <div className="divide-y divide-border">
      {tasks.map((task) => {
        const employee = employeeById.get(task.employeeId);
        const project = projectById.get(task.projectId);
        const own = Boolean(currentEmployeeId && task.employeeId === currentEmployeeId);
        const manage = canManageTask ? canManageTask(task) : canManage;
        const canAct = manage || own;
        const overdue = isTaskOverdue(task, today);
        const busy = busyId === task.id;
        const status = taskStatusMeta[task.status];
        const carryHistory = task.carryHistory ?? [];
        const lastCarry = carryHistory[carryHistory.length - 1];
        const carryCount = task.carryCount ?? carryHistory.length;

        return (
          <div
            key={task.id}
            className={cn(
              'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-surface-2/40 sm:px-5',
              task.status === 'done' && 'opacity-75',
            )}
          >
            <button
              type="button"
              disabled={!canAct || busy || !onToggle}
              onClick={() => {
                if (task.status === 'done') {
                  onToggle?.(task, false);
                } else {
                  setCompleting(task);
                  setResult('');
                }
              }}
              title={task.status === 'done' ? 'Вернуть в работу' : 'Отметить выполненной'}
              aria-label={task.status === 'done' ? 'Вернуть в работу' : 'Отметить выполненной'}
              className={cn(
                'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition',
                task.status === 'done'
                  ? 'border-zinc-500 bg-zinc-500 text-white'
                  : 'border-border bg-surface text-transparent hover:border-zinc-400 hover:text-zinc-400',
                (!canAct || busy) && 'cursor-not-allowed opacity-50',
              )}
            >
              <Check className="size-3.5" />
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <p
                  className={cn(
                    'text-sm font-medium text-fg',
                    task.status === 'done' && 'line-through',
                  )}
                >
                  {task.title}
                </p>
                <Badge tone={status.tone}>{status.label}</Badge>
                {overdue ? <Badge tone="neutral">Просрочено</Badge> : null}
                {carryCount > 0 ? (
                  <span
                    title={
                      lastCarry
                        ? `Последний перенос: ${formatDate(lastCarry.from)} → ${formatDate(lastCarry.to)}`
                        : undefined
                    }
                  >
                    <Badge tone="neutral">Перенос ×{carryCount}</Badge>
                  </span>
                ) : null}
              </div>

              {task.description ? (
                <p className="mt-0.5 text-xs text-muted">{task.description}</p>
              ) : null}

              {task.status === 'done' && task.completionComment ? (
                <p className="mt-1 border-l-2 border-border pl-2 text-xs text-muted">
                  <span className="font-medium text-fg">Результат:</span> {task.completionComment}
                </p>
              ) : null}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                {showProject ? (
                  project ? (
                    canOpenCards ? (
                      <Link
                        to={`/projects/${project.id}`}
                        className="font-medium text-fg transition hover:text-primary"
                      >
                        {project.code} · {project.name}
                      </Link>
                    ) : (
                      <span className="font-medium text-fg">
                        {project.code} · {project.name}
                      </span>
                    )
                  ) : (
                    <span>Проект не найден</span>
                  )
                ) : null}
                {showEmployee ? (
                  employee ? (
                    canOpenCards ? (
                      <Link
                        to={`/employees/${employee.id}`}
                        className="font-medium text-fg transition hover:text-primary"
                      >
                        {fullName(employee)}
                      </Link>
                    ) : (
                      <span className="font-medium text-fg">{fullName(employee)}</span>
                    )
                  ) : (
                    <span>Сотрудник не найден</span>
                  )
                ) : null}
                <span className={cn('inline-flex items-center gap-1', overdue && 'font-medium text-fg')}>
                  <CalendarDays className="size-3" />
                  {task.status === 'done' ? 'Срок' : 'Выполнить до'} {formatDate(task.dueDate)}
                </span>
                {task.estimateHours ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="size-3" />
                    {task.estimateHours} ч
                  </span>
                ) : null}
                {task.status === 'done' && task.completedAt ? (
                  <span>
                    Выполнено {formatDate(task.completedAt)}
                    {task.completedByName ? ` · ${task.completedByName}` : ''}
                  </span>
                ) : null}
                <span className="hidden sm:inline">
                  Поставил: {task.createdByName}
                </span>
              </div>
            </div>

            {canAct ? (
              <div className="flex shrink-0 items-center gap-0.5">
                {task.status === 'todo' && onPostpone ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPostpone(task)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                    title="Потребовалось больше времени — перенести на следующий рабочий день"
                    aria-label="Перенести задачу на следующий рабочий день"
                  >
                    <CalendarClock className="size-4" />
                  </button>
                ) : null}
                {manage && onEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onEdit(task)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                    title="Изменить задачу"
                    aria-label="Изменить задачу"
                  >
                    <Pencil className="size-4" />
                  </button>
                ) : null}
                {manage && onDelete ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onDelete(task)}
                    className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-red-500/10 hover:text-danger disabled:opacity-50"
                    title="Удалить задачу"
                    aria-label="Удалить задачу"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      <Dialog
        open={Boolean(completing)}
        onClose={() => setCompleting(null)}
        title="Закрыть задачу"
        description={completing?.title}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCompleting(null)}>
              Отмена
            </Button>
            <Button
              onClick={() => {
                if (!completing) return;
                onToggle?.(completing, true, result.trim() || undefined);
                setCompleting(null);
              }}
            >
              Выполнено
            </Button>
          </>
        }
      >
        <Field
          label="Результат"
          hint="Желательно, но не обязательно: что именно сделано по задаче"
        >
          <Textarea
            value={result}
            onChange={(event) => setResult(event.target.value)}
            placeholder="Коротко опишите результат — его увидит руководитель"
          />
        </Field>
      </Dialog>
    </div>
  );
}
