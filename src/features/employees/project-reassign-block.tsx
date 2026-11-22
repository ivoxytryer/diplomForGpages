import type { Employee, Project } from '@/shared/types';
import { fullName } from '@/shared/lib/utils';
import { Select } from '@/shared/ui/primitives';

/**
 * Проекты, которыми руководит увольняемый сотрудник.
 * Новый руководитель обязателен, иначе проект останется без ответственного.
 */
export function ProjectReassignBlock({
  projects,
  employees,
  excludeEmployeeId,
  value,
  onChange,
}: {
  projects: Project[];
  employees: Employee[];
  excludeEmployeeId: string;
  value: Record<string, string>;
  onChange: (projectId: string, employeeId: string) => void;
}) {
  if (projects.length === 0) return null;
  const candidates = employees.filter(
    (item) => item.id !== excludeEmployeeId && item.status !== 'dismissed',
  );

  return (
    <div className="rounded-xl border border-border p-3 sm:col-span-2">
      <p className="text-sm font-medium text-fg">
        Проекты под руководством · {projects.length}
      </p>
      <p className="mt-1 text-xs leading-5 text-muted">
        Выберите нового руководителя для каждого проекта.
      </p>
      <div className="mt-3 space-y-2">
        {projects.map((project) => (
          <div
            key={project.id}
            className="grid gap-2 rounded-lg bg-surface-2/50 px-3 py-2 sm:grid-cols-[1fr_220px] sm:items-center"
          >
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-fg">{project.name}</p>
              <p className="truncate text-[10px] text-muted">{project.code}</p>
            </div>
            {candidates.length > 0 ? (
              <Select
                value={value[project.id] ?? ''}
                onChange={(event) => onChange(project.id, event.target.value)}
                className="h-9 text-xs"
                aria-label={`Новый руководитель проекта ${project.name}`}
              >
                <option value="">Выберите руководителя</option>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {fullName(candidate)}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-[11px] text-muted">Нет доступных сотрудников</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
