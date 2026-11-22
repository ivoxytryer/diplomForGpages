import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, UserRoundX } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Assignment } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups, useManagerDepartmentId } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { projectStatusMeta } from '@/shared/lib/meta';
import { cn, fullName } from '@/shared/lib/utils';
import { AssignmentForm } from '@/features/projects/assignment-form';
import { PageHeader, SearchInput, StatCard } from '@/shared/ui/page';
import { Avatar, Badge, Card, EmptyState, ErrorState, Select } from '@/shared/ui/primitives';
import { TableLoader } from '@/shared/ui/table';

interface EditorState {
  employeeId: string;
  projectId: string;
  assignment?: Assignment;
}

export function WorkloadPage() {
  const user = useAuthStore((state) => state.user);
  const managerDepartmentId = useManagerDepartmentId();
  const { employees, projects, departmentById, departments } = useLookups();
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [showOnlyAssigned, setShowOnlyAssigned] = useState(false);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const isEmployee = user?.role === 'employee';
  const canWrite = can(user?.role, 'projects:write');
  const scopedDepartmentId = managerDepartmentId ?? (departmentId || undefined);

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'workload'],
    queryFn: () => api.assignments.list(),
  });

  const activeProjects = useMemo(
    () => projects.filter((project) => project.status !== 'completed'),
    [projects],
  );
  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees
      .filter((employee) => employee.status !== 'dismissed')
      .filter((employee) => (isEmployee ? employee.id === user?.employeeId : true))
      .filter((employee) => (scopedDepartmentId ? employee.departmentId === scopedDepartmentId : true))
      .filter((employee) => (term ? fullName(employee).toLowerCase().includes(term) : true));
  }, [employees, isEmployee, user?.employeeId, scopedDepartmentId, search]);

  const assignments = useMemo<Assignment[]>(
    () => assignmentsQuery.data ?? [],
    [assignmentsQuery.data],
  );
  const visibleProjects = useMemo(() => {
    if (!isEmployee) return activeProjects;
    const assignedIds = new Set(
      assignments
        .filter((assignment) => assignment.employeeId === user?.employeeId)
        .map((assignment) => assignment.projectId),
    );
    return activeProjects.filter((project) => assignedIds.has(project.id));
  }, [isEmployee, activeProjects, assignments, user?.employeeId]);
  const activeProjectIds = useMemo(
    () => new Set(visibleProjects.map((project) => project.id)),
    [visibleProjects],
  );
  const assignmentByKey = useMemo(() => {
    const map = new Map<string, Assignment>();
    assignments.forEach((assignment) => map.set(`${assignment.employeeId}|${assignment.projectId}`, assignment));
    return map;
  }, [assignments]);

  const visibleIds = useMemo(
    () => new Set(visibleEmployees.map((employee) => employee.id)),
    [visibleEmployees],
  );

  const rows = useMemo(() => {
    const list = visibleEmployees.map((employee) => {
      const employeeAssignments = assignments.filter(
        (assignment) =>
          assignment.employeeId === employee.id && activeProjectIds.has(assignment.projectId),
      );
      const total = employeeAssignments.reduce((sum, assignment) => sum + assignment.allocation, 0);
      return { employee, total };
    });
    return showOnlyAssigned ? list.filter((row) => row.total > 0) : list;
  }, [visibleEmployees, assignments, showOnlyAssigned, activeProjectIds]);

  const projectTotals = useMemo(() => {
    const map = new Map<string, number>();
    visibleProjects.forEach((project) => {
      const total = assignments
        .filter((assignment) => assignment.projectId === project.id && visibleIds.has(assignment.employeeId))
        .reduce((sum, assignment) => sum + assignment.allocation, 0);
      map.set(project.id, total);
    });
    return map;
  }, [visibleProjects, assignments, visibleIds]);

  const totalAllocation = rows.reduce((sum, row) => sum + row.total, 0);
  const overloaded = rows.filter((row) => row.total > 100).length;
  const unassigned = rows.filter((row) => row.total === 0).length;
  const avgLoad = rows.length ? Math.round(totalAllocation / rows.length) : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Учёт времени"
        title={isEmployee ? 'Моя загрузка' : 'Матрица загрузки'}
        description={
          isEmployee
            ? 'Проекты, на которых вы участвуете, и ваша загрузка'
            : 'Распределение сотрудников по проектам в процентах от рабочего времени'
        }
      />

      {isEmployee ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard label="Мои проекты" value={visibleProjects.length} icon={Activity} />
          <StatCard label="Моя загрузка" value={`${rows[0]?.total ?? 0}%`} icon={Activity} />
        </div>
      ) : (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Сотрудников" value={rows.length} icon={Activity} tone="info" />
          <StatCard label="Средняя загрузка" value={`${avgLoad}%`} icon={Activity} tone="primary" />
          <StatCard label="Перегружены" value={overloaded} hint="загрузка выше 100%" icon={AlertTriangle} tone="danger" />
          <StatCard label="Без проектов" value={unassigned} hint="не назначены" icon={UserRoundX} tone="warning" />
        </div>
      )}

      {!isEmployee ? (
        <Card className="mb-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Поиск сотрудника…"
              className="min-w-[220px] flex-1"
            />
            {!managerDepartmentId ? (
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
            <label className="flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={showOnlyAssigned}
                onChange={(event) => setShowOnlyAssigned(event.target.checked)}
                className="size-4 rounded border-border accent-zinc-500"
              />
              Только с проектами
            </label>
          </div>
        </Card>
      ) : null}

      {assignmentsQuery.isError ? (
        <ErrorState message={getErrorMessage(assignmentsQuery.error)} />
      ) : assignmentsQuery.isLoading ? (
        <Card>
          <TableLoader rows={8} cols={6} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState title="Нет сотрудников" description="Измените фильтры или подразделение." icon={Activity} />
        </Card>
      ) : visibleProjects.length === 0 ? (
        <Card>
          <EmptyState
            title={isEmployee ? 'Нет проектов с вашим участием' : 'Нет активных проектов'}
            description={
              isEmployee
                ? 'Руководитель ещё не назначил вас на активные проекты.'
                : 'Создайте проект в разделе «Проекты».'
            }
            icon={Activity}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-xs">
              <thead className="sticky top-0 z-20 bg-surface-2 text-[10px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="sticky left-0 z-30 min-w-[210px] border-b border-border bg-surface-2 px-3 py-2 text-left">
                    Сотрудник
                  </th>
                  {visibleProjects.map((project) => (
                    <th
                      key={project.id}
                      className="min-w-[92px] border-b border-border px-1.5 py-2 text-center"
                      title={`${project.name} · ${projectStatusMeta[project.status].label}`}
                    >
                      <span className="flex flex-col items-center gap-1">
                        <span className="inline-block size-2 rounded-full bg-zinc-500/40" />
                        <span className="line-clamp-2 max-w-[92px] font-semibold normal-case text-fg">
                          {project.code}
                        </span>
                      </span>
                    </th>
                  ))}
                  <th className="min-w-[76px] border-b border-border px-2 py-2 text-center">Итого</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ employee, total }) => (
                  <tr key={employee.id} className="hover:bg-surface-2/40">
                    <td className="sticky left-0 z-10 border-b border-border bg-surface px-3 py-2">
                      <Link to={`/employees/${employee.id}`} className="flex items-center gap-2">
                        <Avatar
                          lastName={employee.lastName}
                          firstName={employee.firstName}
                          size="xs"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-fg hover:text-primary">
                            {fullName(employee)}
                          </span>
                          <span className="block truncate text-[10px] text-muted">
                            {departmentById.get(employee.departmentId)?.name ?? '—'}
                          </span>
                        </span>
                      </Link>
                    </td>
                    {visibleProjects.map((project) => {
                      const assignment = assignmentByKey.get(`${employee.id}|${project.id}`);
                      const value = assignment?.allocation ?? 0;
                      return (
                        <td key={project.id} className="border-b border-border p-0.5 text-center">
                          <button
                            type="button"
                            disabled={!canWrite}
                            onClick={() => setEditor({ employeeId: employee.id, projectId: project.id, assignment })}
                            className={cn(
                              'flex h-8 w-full items-center justify-center rounded text-[11px] font-semibold transition',
                              value > 0 ? 'bg-zinc-500/10 text-fg' : 'text-muted/60',
                              canWrite ? 'hover:ring-2 hover:ring-primary/30' : 'cursor-default',
                            )}
                            title={
                              assignment
                                ? `${project.name} · ${assignment.projectRole} · ${value}%`
                                : `${project.name} · не назначен`
                            }
                          >
                            {value > 0 ? `${value}%` : '—'}
                          </button>
                        </td>
                      );
                    })}
                    <td className="border-b border-border px-2 py-1 text-center">
                      <span
                        className={cn(
                          'inline-flex min-w-[48px] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          total === 0 ? 'bg-zinc-500/10 text-muted' : 'bg-zinc-500/10 text-fg',
                        )}
                      >
                        {total}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-surface-2">
                <tr>
                  <td className="sticky left-0 z-10 border-t border-border bg-surface-2 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Загрузка по проекту
                  </td>
                  {visibleProjects.map((project) => (
                    <td key={project.id} className="border-t border-border px-1.5 py-2 text-center">
                      <span className="text-[11px] font-semibold text-fg">
                        {projectTotals.get(project.id) ?? 0}%
                      </span>
                    </td>
                  ))}
                  <td className="border-t border-border px-2 py-2 text-center">
                    <span className="text-[11px] font-semibold text-fg">{totalAllocation}%</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-2.5 text-[11px] text-muted">
            <Badge tone="neutral">80–100% — норма</Badge>
            <Badge tone="neutral">менее 80% — недогрузка</Badge>
            <Badge tone="neutral">более 100% — перегрузка</Badge>
            <span className="ml-auto">
              {isEmployee ? 'Проектов' : 'Сотрудников в матрице'}:{' '}
              <span className="font-medium text-fg">
                {isEmployee ? visibleProjects.length : rows.length}
              </span>
            </span>
          </div>
        </Card>
      )}

      <AssignmentForm
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        projectId={editor?.projectId}
        employeeId={editor?.employeeId}
        assignment={editor?.assignment}
      />
    </div>
  );
}
