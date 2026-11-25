import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CheckCircle2,
  Link2,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Role, User } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups } from '@/shared/hooks/use-lookups';
import { roleLabels } from '@/shared/lib/meta';
import { fullName, plural } from '@/shared/lib/utils';
import { PageHeader, SearchInput, StatCard } from '@/shared/ui/page';
import { Avatar, Badge, Card, CardHeader, EmptyState, ErrorState, Select } from '@/shared/ui/primitives';
import { Button } from '@/shared/ui/button';
import { TBody, TD, TH, THead, TR, Table } from '@/shared/ui/table';
import { ConfirmDialog } from '@/shared/ui/overlay';
import { useToast } from '@/shared/ui/toast';
import { CreateUserDialog } from '@/features/users/create-user-dialog';

const roles: Role[] = ['admin', 'hr', 'manager', 'employee'];

export function UsersPage() {
  const currentUser = useAuthStore((state) => state.user);
  const { employeeById, employees } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const query = useQuery({
    queryKey: ['users'],
    queryFn: api.users.list,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Pick<User, 'role' | 'isActive'>> }) =>
      api.users.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      toast.success('Пользователь обновлён');
    },
    onError: (error) => toast.error('Не удалось обновить пользователя', getErrorMessage(error)),
  });

  const resetMutation = useMutation({
    mutationFn: api.demo.reset,
    onSuccess: () => {
      queryClient.clear();
      toast.success('Демо-данные восстановлены');
      setResetOpen(false);
      window.setTimeout(() => window.location.reload(), 300);
    },
    onError: (error) => toast.error('Не удалось сбросить данные', getErrorMessage(error)),
  });

  const users = useMemo(() => query.data ?? [], [query.data]);

  const availableEmployees = useMemo(() => {
    const linked = new Set(users.map((user) => user.employeeId).filter(Boolean));
    return employees.filter(
      (employee) => employee.status !== 'dismissed' && !linked.has(employee.id),
    );
  }, [employees, users]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => {
      const employee = user.employeeId ? employeeById.get(user.employeeId) : null;
      return [user.name, user.email, roleLabels[user.role], employee ? fullName(employee) : '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [users, search, employeeById]);

  const activeCount = users.filter((user) => user.isActive).length;
  const adminCount = users.filter((user) => user.role === 'admin').length;
  const linkedCount = users.filter((user) => user.employeeId).length;

  return (
    <div>
      <PageHeader
        eyebrow="Администрирование"
        title="Пользователи системы"
        description="Учётные записи, роли доступа и привязка к карточкам сотрудников"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => setResetOpen(true)}
            >
              <RotateCcw /> Сбросить демо-данные
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Создать учётную запись
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Всего учётных записей" value={users.length} icon={Users} tone="info" />
        <StatCard label="Активные" value={activeCount} icon={CheckCircle2} tone="success" />
        <StatCard label="Администраторы" value={adminCount} icon={ShieldCheck} tone="purple" />
        <StatCard
          label="Привязаны к сотрудникам"
          value={linkedCount}
          hint={`${users.length - linkedCount} без карточки`}
          icon={Link2}
          tone="warning"
        />
      </div>

      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Имя, email, роль или сотрудник…"
            className="min-w-[240px] flex-1"
          />
          <span className="text-[11px] text-muted">
            Найдено: <span className="font-medium text-fg">{filtered.length}</span> из {users.length}
          </span>
        </div>
      </Card>

      {query.isError ? (
        <ErrorState message={getErrorMessage(query.error)} />
      ) : query.isLoading ? (
        <Card>
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-border/50" />
            ))}
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="Пользователи не найдены"
            description="Измените поисковый запрос."
            icon={UserCog}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <CardHeader
            title="Учётные записи"
            description={`${filtered.length} ${plural(filtered.length, ['пользователь', 'пользователя', 'пользователей'])} · роль и доступ меняются без перезагрузки`}
          />
          <Table>
            <THead>
              <tr>
                <TH>Пользователь</TH>
                <TH>Сотрудник</TH>
                <TH>Роль</TH>
                <TH>Статус</TH>
                <TH className="text-right">Доступ</TH>
              </tr>
            </THead>
            <TBody>
              {filtered.map((user) => {
                const employee = user.employeeId ? employeeById.get(user.employeeId) : null;
                const isSelf = user.id === currentUser?.id;
                return (
                  <TR key={user.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="flex size-8 shrink-0 items-center justify-center border border-border bg-surface-2 text-[11px] font-semibold text-fg"
                        >
                          {(user.name ?? '')
                            .split(' ')
                            .slice(0, 2)
                            .map((part) => part.charAt(0))
                            .join('')}
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-xs font-medium text-fg">{user.name}</span>
                            {isSelf ? <Badge tone="neutral">это вы</Badge> : null}
                          </span>
                          <span className="block truncate text-[11px] text-muted">{user.email}</span>
                        </span>
                      </div>
                    </TD>
                    <TD>
                      {employee ? (
                        <Link
                          to={`/employees/${employee.id}`}
                          className="flex items-center gap-2 text-xs text-fg hover:text-primary"
                        >
                          <Avatar
                            lastName={employee.lastName}
                            firstName={employee.firstName}
                            size="xs"
                          />
                          <span className="truncate">{fullName(employee)}</span>
                        </Link>
                      ) : (
                        <span className="text-xs text-muted">Не привязан</span>
                      )}
                    </TD>
                    <TD>
                      <Select
                        value={user.role}
                        disabled={isSelf || updateMutation.isPending}
                        onChange={(event) =>
                          updateMutation.mutate({
                            id: user.id,
                            payload: { role: event.target.value as Role },
                          })
                        }
                        className="h-8 w-[170px] text-xs"
                        aria-label={`Роль пользователя ${user.name}`}
                      >
                        {roles.map((role) => (
                          <option key={role} value={role}>
                            {roleLabels[role]}
                          </option>
                        ))}
                      </Select>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral" dot>
                          {user.isActive ? 'Активен' : 'Заблокирован'}
                        </Badge>
                        {user.mustChangePassword ? (
                          <Badge tone="warning">Сменит пароль</Badge>
                        ) : null}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex items-center justify-end">
                        <Button
                          variant={user.isActive ? 'outline' : 'primary'}
                          size="sm"
                          disabled={isSelf || updateMutation.isPending}
                          onClick={() =>
                            updateMutation.mutate({
                              id: user.id,
                              payload: { isActive: !user.isActive },
                            })
                          }
                          title={
                            isSelf
                              ? 'Нельзя заблокировать собственную учётную запись'
                              : user.isActive
                                ? 'Заблокировать доступ'
                                : 'Разблокировать доступ'
                          }
                        >
                          {user.isActive ? <Ban /> : <CheckCircle2 />}
                          {user.isActive ? 'Заблокировать' : 'Разблокировать'}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
          <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-2.5 text-[11px] text-muted">
            <Badge tone="neutral" className="capitalize">
              {roleLabels.admin}
            </Badge>
            <span>· полный доступ, управление пользователями и журналом действий</span>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onConfirm={() => resetMutation.mutate()}
        title="Сбросить демо-данные?"
        description="Все изменения (сотрудники, табель, заявки, проекты, задачи) будут заменены исходным демонстрационным набором. Действие необратимо."
        confirmLabel="Сбросить"
        loading={resetMutation.isPending}
      />

      {createOpen ? (
        <CreateUserDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          employees={availableEmployees}
          allowedRoles={roles}
        />
      ) : null}
    </div>
  );
}
