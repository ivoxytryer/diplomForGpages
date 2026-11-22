import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type {
  CreateUserPayload,
  CreateUserResponse,
  Employee,
  EmployeePayload,
  Role,
} from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { can } from '@/shared/lib/permissions';
import { CredentialsDialog } from '@/features/users/credentials-dialog';
import { TaskReassignBlock } from '@/features/employees/task-reassign-block';
import { ProjectReassignBlock } from '@/features/employees/project-reassign-block';
import {
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
  ROLES,
} from '@/shared/lib/enums';
import {
  employmentTypeLabels,
  employeeStatusMeta,
  genderLabels,
  roleLabels,
} from '@/shared/lib/meta';
import { useLookups } from '@/shared/hooks/use-lookups';
import { todayISO } from '@/shared/lib/utils';
import { Dialog, Sheet } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Checkbox, Field, Input, Select } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

const schema = z.object({
  lastName: z.string().min(1, 'Укажите фамилию'),
  firstName: z.string().min(1, 'Укажите имя'),
  middleName: z.string().optional(),
  birthDate: z.string().min(1, 'Укажите дату рождения'),
  gender: z.enum(GENDERS),
  email: z.string().email('Некорректный email'),
  phone: z.string().min(5, 'Укажите телефон'),
  departmentId: z.string().min(1, 'Выберите подразделение'),
  positionId: z.string().min(1, 'Выберите должность'),
  managerId: z.string().optional(),
  hireDate: z.string().min(1, 'Укажите дату приёма'),
  status: z.enum(EMPLOYEE_STATUSES),
  employmentType: z.enum(EMPLOYMENT_TYPES),
  salary: z
    .number({ invalid_type_error: 'Укажите оклад' })
    .min(0, 'Оклад не может быть отрицательным'),
  education: z.string().optional(),
  createAccount: z.boolean(),
  accountEmail: z.string().optional(),
  accountRole: z.enum(ROLES),
}).superRefine((values, ctx) => {
  if (!values.createAccount) return;
  const email = z.string().email().safeParse(values.accountEmail);
  if (!email.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['accountEmail'],
      message: 'Укажите корректный email для входа',
    });
  }
});

type FormValues = z.infer<typeof schema>;

interface SubmitResult {
  employee: Employee;
  account?: CreateUserResponse;
  accountError?: string;
  accountPayload?: CreateUserPayload;
}

function defaults(
  employee: Employee | null | undefined,
  departmentId: string,
  positionId: string,
  defaultSalary: number,
): FormValues {
  return {
    lastName: employee?.lastName ?? '',
    firstName: employee?.firstName ?? '',
    middleName: employee?.middleName ?? '',
    birthDate: employee?.birthDate ?? '1990-01-01',
    gender: employee?.gender ?? 'male',
    email: employee?.email ?? '',
    phone: employee?.phone ?? '',
    departmentId: employee?.departmentId ?? departmentId,
    positionId: employee?.positionId ?? positionId,
    managerId: employee?.managerId ?? '',
    hireDate: employee?.hireDate ?? todayISO(),
    status: employee?.status ?? 'active',
    employmentType: employee?.employmentType ?? 'full',
    salary: employee?.salary ?? defaultSalary,
    education: employee?.education ?? '',
    createAccount: false,
    accountEmail: employee?.email ?? '',
    accountRole: 'employee',
  };
}

export function EmployeeForm({
  open,
  onClose,
  employee,
}: {
  open: boolean;
  onClose: () => void;
  employee?: Employee | null;
}) {
  const { departments, positions, employees, projects, projectById } = useLookups();
  const currentUser = useAuthStore((state) => state.user);
  const canEditSalary = can(currentUser?.role, 'salary:write');
  const salaryDefault = canEditSalary ? 100000 : 0;
  const queryClient = useQueryClient();
  const toast = useToast();

  const [createdEmployee, setCreatedEmployee] = useState<Employee | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [accountPayload, setAccountPayload] = useState<CreateUserPayload | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [reassignments, setReassignments] = useState<Record<string, string>>({});
  const [projectReassignments, setProjectReassignments] = useState<Record<string, string>>({});

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(
      employee,
      departments[0]?.id ?? '',
      positions.find((item) => item.departmentId === (departments[0]?.id ?? ''))?.id ??
        positions[0]?.id ??
        '',
      salaryDefault,
    ),
  });

  const createAccount = watch('createAccount');
  const emailValue = watch('email');
  const statusValue = watch('status');
  const departmentValue = watch('departmentId');
  const availablePositions = positions.filter(
    (position) => !position.departmentId || position.departmentId === departmentValue,
  );

  useEffect(() => {
    if (!open) return;
    reset(
      defaults(
        employee,
        departments[0]?.id ?? '',
        positions.find((item) => item.departmentId === (departments[0]?.id ?? ''))?.id ??
          positions[0]?.id ??
          '',
        salaryDefault,
      ),
    );
    setCreatedEmployee(null);
    setAccountError(null);
    setAccountPayload(null);
    setCredentials(null);
    setReassignments({});
    setProjectReassignments({});
  }, [open, employee, reset, departments, positions, salaryDefault]);

  useEffect(() => {
    if (!open || !departmentValue) return;
    const allowed = positions.filter((position) => position.departmentId === departmentValue);
    if (!allowed.length) return;
    const current = getValues('positionId');
    if (!allowed.some((position) => position.id === current)) {
      setValue('positionId', allowed[0].id, { shouldValidate: true });
    }
  }, [open, departmentValue, positions, getValues, setValue]);

  useEffect(() => {
    if (createAccount && !getValues('accountEmail')) {
      setValue('accountEmail', emailValue);
    }
  }, [createAccount, emailValue, getValues, setValue]);

  const allowedRoles: Role[] =
    currentUser?.role === 'admin' ? ['employee', 'manager', 'hr', 'admin'] : ['employee'];
  const canDismiss = currentUser?.role === 'admin';

  useEffect(() => {
    if (statusValue !== 'dismissed') {
      setReassignments({});
      setProjectReassignments({});
    }
  }, [statusValue]);

  const reassignEnabled = Boolean(
    open && employee && canDismiss && statusValue === 'dismissed',
  );
  const activeTasksQuery = useQuery({
    queryKey: ['tasks', 'reassign', employee?.id],
    queryFn: () => api.tasks.list({ employeeId: employee!.id, status: 'todo' }),
    enabled: reassignEnabled,
  });
  const reassignAssignmentsQuery = useQuery({
    queryKey: ['assignments', 'reassign'],
    queryFn: () => api.assignments.list(),
    enabled: reassignEnabled,
  });
  const activeTasks = activeTasksQuery.data ?? [];
  const reassignAssignments = reassignAssignmentsQuery.data ?? [];
  const managedProjects = employee
    ? projects.filter((project) => project.managerId === employee.id)
    : [];
  const pendingTasks = activeTasks.filter((task) => !reassignments[task.id]);
  const pendingProjects = managedProjects.filter(
    (project) => !projectReassignments[project.id],
  );
  const dismissalBlocked =
    canDismiss &&
    Boolean(employee) &&
    statusValue === 'dismissed' &&
    (activeTasksQuery.isLoading ||
      pendingTasks.length > 0 ||
      pendingProjects.length > 0);

  const invalidateEmployeeQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['employees'] });
    queryClient.invalidateQueries({ queryKey: ['employee'] });
    queryClient.invalidateQueries({ queryKey: ['timesheet'] });
    queryClient.invalidateQueries({ queryKey: ['payroll'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['events'] });
    queryClient.invalidateQueries({ queryKey: ['workload'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
    queryClient.invalidateQueries({ queryKey: ['audit'] });
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues): Promise<SubmitResult> => {
      const payload: EmployeePayload = {
        lastName: values.lastName,
        firstName: values.firstName,
        middleName: values.middleName || undefined,
        birthDate: values.birthDate,
        gender: values.gender,
        email: values.email,
        phone: values.phone,
        departmentId: values.departmentId,
        positionId: values.positionId,
        managerId: values.managerId || null,
        hireDate: values.hireDate,
        status: values.status,
        employmentType: values.employmentType,
        salary: values.salary,
        education: values.education || undefined,
      };

      if (employee && values.status === 'dismissed') {
        const selected = Object.entries(reassignments).filter(([, target]) => target);
        for (const [taskId, target] of selected) {
          await api.tasks.update(taskId, { employeeId: target });
        }
        const selectedProjects = Object.entries(projectReassignments).filter(
          ([, target]) => target,
        );
        for (const [projectId, target] of selectedProjects) {
          await api.projects.update(projectId, { managerId: target });
        }
      }

      if (employee) {
        const updated = await api.employees.update(employee.id, payload);
        return { employee: updated };
      }

      const created = await api.employees.create(payload);
      if (!values.createAccount) return { employee: created };

      const account: CreateUserPayload = {
        employeeId: created.id,
        email: (values.accountEmail || values.email).trim(),
        name: `${values.lastName} ${values.firstName}`.trim(),
        role: values.accountRole,
      };

      try {
        return { employee: created, account: await api.users.create(account), accountPayload: account };
      } catch (error) {
        return {
          employee: created,
          accountError: getErrorMessage(error),
          accountPayload: account,
        };
      }
    },
    onSuccess: (result) => {
      invalidateEmployeeQueries();
      if (result.account) {
        toast.success('Сотрудник и учётная запись созданы');
        onClose();
        setCredentials({
          email: result.account.user.email,
          password: result.account.temporaryPassword,
        });
        return;
      }
      if (result.accountError) {
        onClose();
        setCreatedEmployee(result.employee);
        setAccountError(result.accountError);
        setAccountPayload(result.accountPayload ?? null);
        return;
      }
      toast.success(employee ? 'Карточка обновлена' : 'Сотрудник добавлен');
      onClose();
    },
    onError: (error) => toast.error('Не удалось сохранить', getErrorMessage(error)),
  });

  const retryMutation = useMutation({
    mutationFn: (payload: CreateUserPayload) => api.users.create(payload),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['employee-account'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      setAccountError(null);
      setAccountPayload(null);
      setCreatedEmployee(null);
      setCredentials({ email: response.user.email, password: response.temporaryPassword });
      toast.success('Учётная запись создана', response.user.email);
    },
    onError: (error) => {
      setAccountError(getErrorMessage(error));
      toast.error('Повторная попытка не удалась', getErrorMessage(error));
    },
  });

  const dismissAccountError = () => {
    setAccountError(null);
    setAccountPayload(null);
    setCreatedEmployee(null);
  };

  const copyAccountEmail = async () => {
    const email = accountPayload?.email ?? createdEmployee?.email;
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      toast.success('Email скопирован');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const managers = employees.filter(
    (item) => item.id !== employee?.id && item.status !== 'dismissed',
  );

  return (
    <>
    <Sheet
      open={open}
      onClose={onClose}
      title={employee ? 'Редактирование сотрудника' : 'Новый сотрудник'}
      description="Заполните кадровые и контактные данные. Поля со звёздочкой обязательны."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="submit"
            form="employee-form"
            loading={mutation.isPending}
            disabled={dismissalBlocked}
            title={
              dismissalBlocked
                ? 'Сначала переназначьте задачи и назначьте руководителей проектов'
                : undefined
            }
          >
            {employee ? 'Сохранить' : 'Добавить'}
          </Button>
        </>
      }
    >
      <form
        id="employee-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid gap-3 sm:grid-cols-2"
      >
        <Field label="Фамилия *" error={errors.lastName?.message}>
          <Input {...register('lastName')} placeholder="Иванов" />
        </Field>
        <Field label="Имя *" error={errors.firstName?.message}>
          <Input {...register('firstName')} placeholder="Иван" />
        </Field>
        <Field label="Отчество" error={errors.middleName?.message} className="sm:col-span-2">
          <Input {...register('middleName')} placeholder="Иванович" />
        </Field>
        <Field label="Дата рождения *" error={errors.birthDate?.message}>
          <Input type="date" {...register('birthDate')} />
        </Field>
        <Field label="Пол" error={errors.gender?.message}>
          <Select {...register('gender')}>
            <option value="male">{genderLabels.male}</option>
            <option value="female">{genderLabels.female}</option>
          </Select>
        </Field>
        <Field label="Email *" error={errors.email?.message}>
          <Input type="email" {...register('email')} placeholder="name@company.ru" />
        </Field>
        <Field label="Телефон *" error={errors.phone?.message}>
          <Input {...register('phone')} placeholder="+7 (900) 000-00-00" />
        </Field>

        <Field label="Подразделение *" error={errors.departmentId?.message}>
          <Select {...register('departmentId')}>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Должность *" error={errors.positionId?.message}>
          <Select {...register('positionId')}>
            {availablePositions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.name} · {position.family} · грейд {position.grade}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Руководитель" error={errors.managerId?.message}>
          <Select {...register('managerId')}>
            <option value="">Не указан</option>
            {managers.map((manager) => (
              <option key={manager.id} value={manager.id}>
                {manager.lastName} {manager.firstName}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Тип занятости" error={errors.employmentType?.message}>
          <Select {...register('employmentType')}>
            {Object.entries(employmentTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Дата приёма *"
          error={errors.hireDate?.message}
          hint="С этой даты в табеле начисляются явки; дни до приёма отмечаются как «—»"
        >
          <Input type="date" {...register('hireDate')} />
        </Field>
        <Field
          label="Статус"
          error={errors.status?.message}
          hint={canDismiss ? undefined : 'Увольнение и восстановление выполняет администратор'}
        >
          <Select {...register('status')}>
            {Object.entries(employeeStatusMeta).map(([value, meta]) => (
              <option
                key={value}
                value={value}
                disabled={value === 'dismissed' && !canDismiss}
              >
                {meta.label}
              </option>
            ))}
          </Select>
        </Field>
        {canDismiss && statusValue === 'dismissed' && employee ? (
          <>
            <p className="text-xs leading-5 text-muted sm:col-span-2">
              Перед увольнением переназначьте задачи и руководителей проектов.
            </p>
            <TaskReassignBlock
              tasks={activeTasks}
              assignments={reassignAssignments}
              employees={employees}
              projectById={projectById}
              excludeEmployeeId={employee.id}
              value={reassignments}
              onChange={(taskId, target) =>
                setReassignments((previous) => ({ ...previous, [taskId]: target }))
              }
              mode="dismiss"
            />
            <ProjectReassignBlock
              projects={managedProjects}
              employees={employees}
              excludeEmployeeId={employee.id}
              value={projectReassignments}
              onChange={(projectId, target) =>
                setProjectReassignments((previous) => ({ ...previous, [projectId]: target }))
              }
            />
            {dismissalBlocked && !activeTasksQuery.isLoading ? (
              <p className="text-xs text-muted sm:col-span-2">
                Осталось переназначить: задачи — {pendingTasks.length}, проекты —{' '}
                {pendingProjects.length}.
              </p>
            ) : null}
          </>
        ) : null}
        <Field
          label="Оклад, ₽ *"
          error={errors.salary?.message}
          hint={canEditSalary ? undefined : 'Оклад устанавливает администратор'}
        >
          <Input
            type="number"
            min={0}
            step={1000}
            readOnly={!canEditSalary}
            className={!canEditSalary ? 'cursor-not-allowed opacity-70' : undefined}
            {...register('salary', { valueAsNumber: true })}
          />
        </Field>
        <Field label="Образование" error={errors.education?.message} className="sm:col-span-2">
          <Input {...register('education')} placeholder="Учебное заведение, специальность" />
        </Field>

        {!employee ? (
          <div className="rounded-xl bg-surface-2/60 p-3 sm:col-span-2">
            <label className="flex cursor-pointer items-start gap-3">
              <Checkbox
                className="mt-0.5"
                checked={createAccount}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setValue('createAccount', checked, { shouldValidate: false });
                  if (checked && !getValues('accountEmail')) {
                    setValue('accountEmail', getValues('email'));
                  }
                }}
              />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-medium text-fg">
                  <KeyRound className="size-4 text-primary" />
                  Создать учётную запись для входа
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  Без учётной записи сотрудник будет добавлен только в кадровый учёт и не сможет
                  войти в систему. Доступ можно создать позже из карточки.
                </span>
              </span>
            </label>

            {createAccount ? (
              <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
                <Field label="Email для входа *" error={errors.accountEmail?.message}>
                  <Input
                    type="email"
                    {...register('accountEmail')}
                    placeholder="name@company.ru"
                  />
                </Field>
                <Field label="Роль в системе">
                  {allowedRoles.length > 1 ? (
                    <Select {...register('accountRole')}>
                      {allowedRoles.map((role) => (
                        <option key={role} value={role}>
                          {roleLabels[role]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <div className="flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3 text-sm text-fg">
                      <KeyRound className="size-4 text-muted" />
                      {roleLabels.employee}
                    </div>
                  )}
                </Field>
                <p className="text-[11px] text-muted sm:col-span-2">
                  Временный пароль сгенерирует система и покажет один раз. При первом входе
                  сотрудник обязан сменить его на постоянный.
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </form>
    </Sheet>

    <Dialog
      open={Boolean(accountError)}
      onClose={dismissAccountError}
      title="Сотрудник сохранён, доступ не создан"
      description="Карточка уже добавлена в систему. Учётную запись можно создать повторно."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={dismissAccountError}>
            Позже
          </Button>
          <Button
            type="button"
            loading={retryMutation.isPending}
            disabled={!accountPayload}
            onClick={() => accountPayload && retryMutation.mutate(accountPayload)}
          >
            Повторить
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-muted">
        <p className="rounded-lg border border-danger/30 px-3 py-2 text-xs text-danger">
          {accountError}
        </p>
        <p>
          Сотрудник создан и доступен в кадровом учёте. Если повторная попытка не удастся,
          создайте доступ из карточки сотрудника или раздела «Пользователи».
        </p>
        {createdEmployee ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-surface-2 px-3 py-2 text-xs">
            <span className="truncate font-mono text-fg">
              {accountPayload?.email ?? createdEmployee.email}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={copyAccountEmail}>
              Копировать
            </Button>
          </div>
        ) : null}
      </div>
    </Dialog>

    <CredentialsDialog
      open={Boolean(credentials)}
      onClose={() => setCredentials(null)}
      email={credentials?.email ?? ''}
      password={credentials?.password ?? ''}
    />
    </>
  );
}
