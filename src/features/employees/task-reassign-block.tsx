import type { Assignment, Employee, Project, ProjectTask } from '@/shared/types';
import { fullName, todayISO } from '@/shared/lib/utils';
import { Select } from '@/shared/ui/primitives';

/**
 * Список активных задач сотрудника с выбором нового исполнителя.
 * Показывается только когда задачи реально есть.
 */
export function TaskReassignBlock({
  tasks,
  assignments,
  employees,
  projectById,
  excludeEmployeeId,
  value,
  onChange,
  mode,
}: {
  tasks: ProjectTask[];
  assignments: Assignment[];
  employees: Employee[];
  projectById: Map<string, Project>;
  excludeEmployeeId: string;
  value: Record<string, string>;
  onChange: (taskId: string, employeeId: string) => void;
  mode: 'dismiss' | 'delete' | 'absence';
}) {
  if (tasks.length === 0) return null;

  const today = todayISO();
  const projectEmployees = new Map<string, Set<string>>();
  assignments.forEach((assignment) => {
    if (assignment.endDate && assignment.endDate < today) return;
    const set = projectEmployees.get(assignment.projectId) ?? new Set<string>();
    set.add(assignment.employeeId);
    projectEmployees.set(assignment.projectId, set);
  });

  return (
    <div className="rounded-xl border border-border p-3 sm:col-span-2">
      <p className="text-sm font-medium text-fg">Активные задачи · {tasks.length}</p>
      <p className="mt-1 text-xs leading-5 text-muted">
        {mode === 'dismiss'
          ? 'Выберите нового исполнителя для каждой задачи.'
          : mode === 'absence'
            ? 'Выберите, кому передать задачи на время отсутствия.'
            : 'Выберите нового исполнителя. Если не переназначить, задача будет удалена вместе с сотрудником.'}
      </p>
      <div className="mt-3 space-y-2">
        {tasks.map((task) => {
          const project = projectById.get(task.projectId);
          const allowed = projectEmployees.get(task.projectId) ?? new Set<string>();
          const candidates = employees.filter(
            (item) =>
              allowed.has(item.id) &&
              item.id !== excludeEmployeeId &&
              item.status !== 'dismissed',
          );
          return (
            <div
              key={task.id}
              className="grid gap-2 rounded-lg bg-surface-2/50 px-3 py-2 sm:grid-cols-[1fr_220px] sm:items-center"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-fg">{task.title}</p>
                <p className="truncate text-[10px] text-muted">
                  {project ? `${project.code} · ${project.name}` : task.projectId}
                </p>
              </div>
              {candidates.length > 0 ? (
                <Select
                  value={value[task.id] ?? ''}
                  onChange={(event) => onChange(task.id, event.target.value)}
                  className="h-9 text-xs"
                  aria-label={`Новый исполнитель для задачи ${task.title}`}
                >
                  <option value="">
                    {mode === 'delete' ? 'Не переназначать' : 'Выберите исполнителя'}
                  </option>
                  {candidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {fullName(candidate)}
                    </option>
                  ))}
                </Select>
              ) : (
                <p className="text-[11px] text-muted">Нет доступных участников проекта</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
