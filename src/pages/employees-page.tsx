import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, Eye, Pencil, Plus, RotateCcw, Trash2, Users } from 'lucide-react';
import { api } from '@/shared/api';
import type { Employee, EmployeeStatus } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useDebounced, useLookups, useManagerDepartmentId } from '@/shared/hooks/use-lookups';
import { can } from '@/shared/lib/permissions';
import { employeeStatusMeta } from '@/shared/lib/meta';
import { formatDate, formatMoney, fullName } from '@/shared/lib/utils';
import { EmployeeForm } from '@/features/employees/employee-form';
import { DeleteEmployeeDialog } from '@/features/employees/delete-employee-dialog';
import { PageHeader, SearchInput } from '@/shared/ui/page';
import { Avatar, Badge, Card, EmptyState } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { Select } from '@/shared/ui/primitives';
import { Pagination, TBody, TD, TH, THead, TR, Table, TableLoader } from '@/shared/ui/table';

type SortBy = 'name' | 'hireDate' | 'salary';

export function EmployeesPage() {
  const user = useAuthStore((state) => state.user);
  const managerDepartmentId = useManagerDepartmentId();
  const { departments, positions, projects, departmentById, positionById } = useLookups();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const [departmentId, setDepartmentId] = useState('');
  const [positionId, setPositionId] = useState('');
  const [status, setStatus] = useState<EmployeeStatus | ''>('');
  const [projectId, setProjectId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState<Employee | null>(null);

  const canWrite = can(user?.role, 'employees:write');
  const canDelete = can(user?.role, 'employees:delete');
  const canSeeAllSalaries = user?.role === 'admin' || user?.role === 'hr';
  const scopedDepartmentId = managerDepartmentId ?? (departmentId || undefined);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentId, positionId, status, projectId, pageSize, sortBy, sortDir]);

  const query = useQuery({
    queryKey: [
      'employees',
      'list',
      debouncedSearch,
      scopedDepartmentId,
      positionId,
      status,
      projectId,
      page,
      pageSize,
      sortBy,
      sortDir,
    ],
    queryFn: () =>
      api.employees.list({
        search: debouncedSearch || undefined,
        departmentId: scopedDepartmentId,
        positionId: positionId || undefined,
        status,
        projectId: projectId || undefined,
        page,
        pageSize,
        sortBy,
        sortDir,
      }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const total = query.data?.total;
    if (total === undefined) return;
    const lastPage = Math.max(1, Math.ceil(total / pageSize));
    if (page > lastPage) setPage(lastPage);
  }, [page, pageSize, query.data?.total]);

  const toggleSort = (next: SortBy) => {
    if (sortBy === next) {
      setSortDir((value) => (value === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(next);
      setSortDir('asc');
    }
  };

  const sortIcon = (column: SortBy) => {
    if (sortBy !== column) return <ArrowUpDown className="size-3.5 opacity-50" />;
    return sortDir === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
  };

  const resetFilters = () => {
    setSearch('');
    setDepartmentId('');
    setPositionId('');
    setStatus('');
    setProjectId('');
  };

  const items = query.data?.items ?? [];
  const hasFilters = Boolean(search || departmentId || positionId || status || projectId);

  return (
    <div>
      <PageHeader
        eyebrow="Персонал"
        title="Сотрудники"
        description="Реестр сотрудников с фильтрами, сортировкой и карточками"
        actions={
          canWrite ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus /> Добавить сотрудника
            </Button>
          ) : null
        }
      />

      {managerDepartmentId ? (
        <div className="mb-3 flex items-center gap-2 rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
          <Users className="size-4 text-primary" />
          Показаны сотрудники вашего подразделения:{' '}
          <span className="font-medium text-fg">
            {departmentById.get(managerDepartmentId)?.name ?? '—'}
          </span>
        </div>
      ) : null}

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="ФИО, email, табельный номер…"
            className="min-w-[220px] flex-1"
          />
          {!managerDepartmentId ? (
            <Select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="w-auto min-w-[170px]"
              aria-label="Подразделение"
            >
              <option value="">Все подразделения</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          ) : null}
          <Select
            value={positionId}
            onChange={(event) => setPositionId(event.target.value)}
            className="w-auto min-w-[170px]"
            aria-label="Должность"
          >
            <option value="">Все должности</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name}
              </option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value as EmployeeStatus | '')}
            className="w-auto min-w-[150px]"
            aria-label="Статус"
          >
            <option value="">Все статусы</option>
            {Object.entries(employeeStatusMeta).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
          <Select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="w-auto min-w-[160px]"
            aria-label="Проект"
          >
            <option value="">Все проекты</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          {hasFilters ? (
            <Button variant="ghost" size="md" onClick={resetFilters} title="Сбросить фильтры">
              <RotateCcw /> Сбросить
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="mt-3 overflow-hidden">
        {query.isLoading ? (
          <TableLoader rows={8} cols={6} />
        ) : items.length === 0 ? (
          <EmptyState
            title="Сотрудники не найдены"
            description="Попробуйте изменить условия поиска или добавьте нового сотрудника."
            icon={Users}
            action={
              hasFilters ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Сбросить фильтры
                </Button>
              ) : null
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <tr>
                  <TH>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort('name')}>
                      Сотрудник {sortIcon('name')}
                    </button>
                  </TH>
                  <TH>Должность / подразделение</TH>
                  <TH>Статус</TH>
                  <TH>
                    <button type="button" className="flex items-center gap-1" onClick={() => toggleSort('hireDate')}>
                      Дата приёма {sortIcon('hireDate')}
                    </button>
                  </TH>
                  {canSeeAllSalaries ? (
                    <TH className="text-right">
                      <button
                        type="button"
                        className="ml-auto flex items-center gap-1"
                        onClick={() => toggleSort('salary')}
                      >
                        Оклад {sortIcon('salary')}
                      </button>
                    </TH>
                  ) : null}
                  <TH className="w-28 text-right">Действия</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((employee) => {
                  const meta = employeeStatusMeta[employee.status];
                  return (
                    <TR key={employee.id}>
                      <TD>
                        <Link to={`/employees/${employee.id}`} className="flex items-center gap-2.5">
                          <Avatar
                            lastName={employee.lastName}
                            firstName={employee.firstName}
                            middleName={employee.middleName}
                            size="sm"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-fg hover:text-primary">
                              {fullName(employee)}
                            </span>
                            <span className="block truncate text-[11px] text-muted">
                              {employee.email}
                            </span>
                          </span>
                        </Link>
                      </TD>
                      <TD>
                        <p className="text-xs font-medium text-fg">
                          {positionById.get(employee.positionId)?.name ?? '—'}
                        </p>
                        <p className="text-[11px] text-muted">
                          {departmentById.get(employee.departmentId)?.name ?? '—'}
                        </p>
                      </TD>
                      <TD>
                        <Badge tone={meta.tone} dot>
                          {meta.label}
                        </Badge>
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-muted">{formatDate(employee.hireDate)}</TD>
                      {canSeeAllSalaries ? (
                        <TD className="whitespace-nowrap text-right text-xs font-medium text-fg">
                          {formatMoney(employee.salary)}
                        </TD>
                      ) : null}
                      <TD>
                        <div className="flex items-center justify-end gap-1">
                          <Link
                            to={`/employees/${employee.id}`}
                            className="inline-flex size-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-fg"
                            title="Открыть карточку"
                          >
                            <Eye className="size-4" />
                          </Link>
                          {canWrite ? (
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(employee);
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
                              onClick={() => setDeleting(employee)}
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
              total={query.data?.total ?? 0}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </>
        )}
      </Card>

      <EmployeeForm open={formOpen} onClose={() => setFormOpen(false)} employee={editing} />

      <DeleteEmployeeDialog
        employee={deleting}
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
