import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { KeyRound, UserPlus } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { CreateUserResponse, Employee, Role } from '@/shared/types';
import { roleLabels } from '@/shared/lib/meta';
import { fullName } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';
import { CredentialsDialog } from './credentials-dialog';

export function CreateUserDialog({
  open,
  onClose,
  employees,
  allowedRoles,
  title = 'Новая учётная запись',
}: {
  open: boolean;
  onClose: () => void;
  employees: Employee[];
  allowedRoles: Role[];
  title?: string;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? '');
  const [email, setEmail] = useState(employees[0]?.email ?? '');
  const [role, setRole] = useState<Role>(allowedRoles.includes('employee') ? 'employee' : allowedRoles[0] ?? 'employee');
  const [credentials, setCredentials] = useState<CreateUserResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const selected = employees.find((employee) => employee.id === employeeId);
    if (selected) return;
    const first = employees[0];
    setEmployeeId(first?.id ?? '');
    setEmail(first?.email ?? '');
  }, [open, employees, employeeId]);

  const mutation = useMutation({
    mutationFn: () =>
      api.users.create({
        employeeId: employeeId || null,
        email: email.trim(),
        role,
      }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['employee-account'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setError('');
      setCredentials(response);
      toast.success('Учётная запись создана', response.user.email);
    },
    onError: (caught) => setError(getErrorMessage(caught)),
  });

  const closeCredentials = () => {
    setCredentials(null);
    onClose();
  };

  if (credentials) {
    return (
      <CredentialsDialog
        open={open}
        onClose={closeCredentials}
        email={credentials.user.email}
        password={credentials.temporaryPassword}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description="Доступ создаётся только для существующей карточки сотрудника."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            loading={mutation.isPending}
            disabled={!employeeId || !email}
            onClick={() => mutation.mutate()}
          >
            <UserPlus /> Создать доступ
          </Button>
        </>
      }
    >
      {employees.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          Нет сотрудников без учётной записи. Сначала добавьте сотрудника или проверьте
          существующие доступы.
        </p>
      ) : (
        <div className="space-y-3">
          <Field label="Сотрудник *">
            <Select
              value={employeeId}
              onChange={(event) => {
                const next = employees.find((item) => item.id === event.target.value);
                setEmployeeId(event.target.value);
                if (next) setEmail(next.email);
              }}
            >
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {fullName(employee)} · {employee.email}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Email для входа *" hint="Можно изменить, если в карточке указан другой адрес.">
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.ru"
              autoComplete="off"
            />
          </Field>

          <Field label="Роль в системе">
            {allowedRoles.length > 1 ? (
              <Select value={role} onChange={(event) => setRole(event.target.value as Role)}>
                {allowedRoles.map((item) => (
                  <option key={item} value={item}>
                    {roleLabels[item]}
                  </option>
                ))}
              </Select>
            ) : (
              <div className="flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-sm text-fg">
                <KeyRound className="size-4 text-muted" />
                {roleLabels[role]}
              </div>
            )}
          </Field>

          <p className="text-[11px] text-muted">
            Временный пароль сгенерирует система. Он будет показан один раз, а при первом входе
            сотрудник обязан сменить его.
          </p>

          {error ? (
            <p className="rounded-lg border border-danger/30 px-3 py-2 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
