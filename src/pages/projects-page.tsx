import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  FolderKanban,
  Pencil,
  Plus,
  Search as SearchIcon,
  Trash2,
  Users,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Project, ProjectStatus } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { projectStatusMeta } from '@/shared/lib/meta';
import { formatDate, fullName, plural } from '@/shared/lib/utils';
import { ProjectForm } from '@/features/projects/project-form';
import { PageHeader, SearchInput, StatCard } from '@/shared/ui/page';
import { Avatar, Badge, Card, EmptyState } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/primitives';
import { Pagination, TBody, TD, TH, THead, TR, Table, TableLoader } from '@/shared/ui/table';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { useToast } from '@/shared/ui/toast';

export function ProjectsPage() {
  const user = useAuthStore((state) => state.user);
  const { projects, employees } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<ProjectStatus | ''>('');
  const [scope, setScope] = useState<'mine' | 'all'>(
    user?.role === 'manager' ? 'mine' : 'all',
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);

  const canWrite = can(user?.role, 'projects:write');
  const canDelete = can(user?.role, 'projects:delete');
  const canEditProject = (project: Project) =>
    canWrite && (user?.role === 'admin' || user?.role === 'hr' || project.managerId === user?.employeeId);
  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'all'],
    queryFn: () => api.assignments.list(),
  });
  const assignments = assignmentsQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.projects.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Проект удалён');
      setDeleting(null);
    },
    onError: (error) => toast.error('Не удалось удалить проект', getErrorMessage(error)),
  });

  const scopedProjects = useMemo(() => {
    if (user?.role === 'manager' && scope === 'mine') {
      return projects.filter((project) => project.managerId === user.employeeId);
    }
    return projects;
  }, [projects, scope, user?.employeeId, user?.role]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scopedProjects.filter((project) => {
      if (status && project.status !== status) return false;
      if (!term) return true;
      return `${project.name} ${project.code} ${project.description ?? ''}`
        .toLowerCase()
        .includes(term);
    });
  }, [scopedProjects, search, status]);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    const lastPage = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [filtered.length, page, pageSize]);

  const teamSize = (projectId: string) =>
    new Set(assignments.filter((assignment) => assignment.projectId === projectId).map((a) => a.employeeId))
      .size;
  const plannedLoad = (projectId: string) =>
    assignments
      .filter((assignment) => assignment.projectId === projectId)
      .reduce((sum, assignment) => sum + assignment.allocation, 0);

  const scopedProjectIds = new Set(scopedProjects.map((project) => project.id));
  const scopedAssignments = assignments.filter((assignment) =>
    scopedProjectIds.has(assignment.projectId),
  );
  const activeProjects = scopedProjects.filter((project) => project.status === 'active').length;
  const totalTeam = new Set(scopedAssignments.map((assignment) => assignment.employeeId)).size;
  const totalLoad = scopedAssignments.reduce((sum, assignment) => sum + assignment.allocation, 0);
  const avgLoad = totalTeam ? Math.round(totalLoad / totalTeam) : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Организация"
        title="Проекты"
        description="Проекты компании, команды и распределение загрузки сотрудников"
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus /> Новый проект
            </Button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Всего проектов" value={scopedProjects.length} icon={FolderKanban} />
        <StatCard label="Активные" value={activeProjects} icon={FolderKanban} tone="success" />
        <StatCard label="Сотрудников в проектах" value={totalTeam} icon={Users} tone="info" />
        <StatCard
          label="Средняя загрузка"
          value={`${avgLoad}%`}
          hint={`${totalLoad}% суммарно`}
          icon={Users}
          tone="purple"
        />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          {user?.role === 'manager' ? (
            <div className="inline-flex border border-border">
              <button
                type="button"
                onClick={() => {
                  setScope('mine');
                  setPage(1);
                }}
                className={`px-3 py-2 text-xs font-medium transition ${
                  scope === 'mine' ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                Мои проекты
              </button>
              <button
                type="button"
                onClick={() => {
                  setScope('all');
                  setPage(1);
                }}
                className={`border-l border-border px-3 py-2 text-xs font-medium transition ${
                  scope === 'all' ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'
                }`}
              >
                Все проекты
              </button>
            </div>
          ) : null}
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Название или код проекта…"
            className="min-w-[220px] flex-1"
          />
          <Select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProjectStatus | '');
              setPage(1);
            }}
            className="w-auto min-w-[170px]"
            aria-label="Статус проекта"
          >
            <option value="">Все статусы</option>
            {Object.entries(projectStatusMeta).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="mt-3 overflow-hidden">
        {assignmentsQuery.isLoading ? (
          <TableLoader rows={7} cols={6} />
        ) : paged.length === 0 ? (
          <EmptyState
            title="Проекты не найдены"
            description="Измените условия поиска или создайте новый проект."
            icon={FolderKanban}
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>Проект</TH>
                  <TH>Статус</TH>
                  <TH>Руководитель</TH>
                  <TH>Команда</TH>
                  <TH>Период</TH>
                  <TH className="w-28 text-right">Действия</TH>
                </tr>
              </THead>
              <TBody>
                {paged.map((project) => {
                  const manager = project.managerId ? employeeById.get(project.managerId) : null;
                  const team = teamSize(project.id);
                  const load = plannedLoad(project.id);
                  const isOwnProject =
                    user?.role !== 'manager' || project.managerId === user?.employeeId;
                  return (
                    <TR key={project.id}>
                      <TD>
                        <Link to={`/projects/${project.id}`} className="flex items-center gap-2.5">
                          <span className="mt-0.5 size-2.5 shrink-0 rounded-full bg-zinc-500/40" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-fg hover:text-primary">
                              {project.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted">
                              {project.code}
                              {project.description ? ` · ${project.description}` : ''}
                            </span>
                            {!isOwnProject ? (
                              <span className="mt-1 inline-block text-[10px] text-muted">
                                Только просмотр
                              </span>
                            ) : null}
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <Badge tone={projectStatusMeta[project.status].tone} dot>
                          {projectStatusMeta[project.status].label}
                        </Badge>
                      </TD>
                      <TD>
                        {manager ? (
                          <span className="flex items-center gap-2">
                            <Avatar
                              lastName={manager.lastName}
                              firstName={manager.firstName}
                              size="xs"
                            />
                            <span className="text-xs text-fg">{fullName(manager)}</span>
                          </span>
                        ) : project.managerName ? (
                          <span className="text-xs text-fg">{project.managerName}</span>
                        ) : (
                          <span className="text-xs text-muted">Не назначен</span>
                        )}
                      </TD>
                      <TD>
                        {isOwnProject ? (
                          <>
                            <p className="text-xs font-medium text-fg">
                              {team} {plural(team, ['человек', 'человека', 'человек'])}
                            </p>
                            <p className="text-[11px] text-muted">загрузка {load}%</p>
                          </>
                        ) : (
                          <span className="text-xs text-muted">—</span>
                        )}
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-muted">
                        {formatDate(project.startDate)} —{' '}
                        {project.endDate ? formatDate(project.endDate) : 'бессрочно'}
                      </TD>
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/projects/${project.id}`}
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
                            title="Открыть проект"
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canEditProject(project) ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(project);
                                setFormOpen(true);
                              }}
                              className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
                              title="Редактировать"
                            >
                              <Pencil className="size-4" />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button
                              type="button"
                              onClick={() => setDeleting(project)}
                              className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-red-500/10 hover:text-danger"
                              title="Удалить"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          </>
        )}
      </Card>

      {filtered.length === 0 && projects.length > 0 ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <SearchIcon className="size-3.5" /> По заданным условиям ничего не найдено.
        </p>
      ) : null}

      <ProjectForm open={formOpen} onClose={() => setFormOpen(false)} project={editing} />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
        title="Удалить проект?"
        description={
          deleting
            ? `${deleting.name} и все назначения сотрудников будут удалены`
            : undefined
        }
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
