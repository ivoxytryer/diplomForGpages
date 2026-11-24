import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { HrEventPayload, HrEventType } from '@/shared/types';
import { eventTypeMeta } from '@/shared/lib/meta';
import { useAuthStore } from '@/features/auth/auth-store';
import { TaskReassignBlock } from '@/features/employees/task-reassign-block';
import { ProjectReassignBlock } from '@/features/employees/project-reassign-block';
import { can } from '@/shared/lib/permissions';
import { useLookups } from '@/shared/hooks/use-lookups';
import { fullName, todayISO } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select, Textarea } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

const eventTypes: HrEventType[] = [
  'hire',
  'transfer',
  'promotion',
  'salary_change',
  'dismissal',
  'vacation',
];

function defaults(employeeId?: string, type: HrEventType = 'transfer'): HrEventPayload {
  return {
    employeeId: employeeId ?? '',
    type,
    date: todayISO(),
    title: eventTypeMeta[type].label,
    description: '',
    toDepartmentId: null,
    toPositionId: null,
    newSalary: null,
  };
}

export function EventForm({
  open,
  onClose,
  defaultEmployeeId,
  defaultType = 'transfer',
  lockEmployee = false,
}: {
  open: boolean;
  onClose: () => void;
  defaultEmployeeId?: string;
  defaultType?: HrEventType;
  lockEmployee?: boolean;
}) {
  const { employees, departments, positions, employeeById, projects, projectById } = useLookups();
  const role = useAuthStore((state) => state.user?.role);
  const canEditSalary = can(role, 'salary:write');
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<HrEventPayload>(() =>
    defaults(defaultEmployeeId, defaultType),
  );
  const [reassignments, setReassignments] = useState<Record<string, string>>({});
  const [projectReassignments, setProjectReassignments] = useState<Record<string, string>>({});
  const availableTypes = eventTypes.filter((type) => {
    if (type === 'dismissal' && role !== 'admin') return false;
    if (type === 'salary_change' && !canEditSalary) return false;
    return true;
  });

  useEffect(() => {
    if (!open) return;
    setValues(defaults(defaultEmployeeId, defaultType));
    setReassignments({});
    setProjectReassignments({});
  }, [open, defaultEmployeeId, defaultType]);

  const reassignEnabled =
    open && values.type === 'dismissal' && Boolean(values.employeeId) && role === 'admin';
  const activeTasksQuery = useQuery({
    queryKey: ['tasks', 'reassign', values.employeeId],
    queryFn: () => api.tasks.list({ employeeId: values.employeeId, status: 'todo' }),
    enabled: reassignEnabled,
  });
  const reassignAssignmentsQuery = useQuery({
    queryKey: ['assignments', 'reassign'],
    queryFn: () => api.assignments.list(),
    enabled: reassignEnabled,
  });
  const activeTasks = activeTasksQuery.data ?? [];
  const reassignAssignments = reassignAssignmentsQuery.data ?? [];
  const managedProjects = values.employeeId
    ? projects.filter((project) => project.managerId === values.employeeId)
    : [];
  const pendingTasks = activeTasks.filter((task) => !reassignments[task.id]);
  const pendingProjects = managedProjects.filter(
    (project) => !projectReassignments[project.id],
  );
  const dismissalBlocked =
    reassignEnabled &&
    (activeTasksQuery.isLoading ||
      pendingTasks.length > 0 ||
      pendingProjects.length > 0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (values.type === 'dismissal' && values.employeeId) {
        for (const [taskId, target] of Object.entries(reassignments).filter(
          ([, target]) => target,
        )) {
          await api.tasks.update(taskId, { employeeId: target });
        }
        for (const [projectId, target] of Object.entries(projectReassignments).filter(
          ([, target]) => target,
        )) {
          await api.projects.update(projectId, { managerId: target });
        }
      }
      const payload: HrEventPayload = {
        ...values,
        description: values.description || undefined,
        toDepartmentId: values.toDepartmentId || null,
        toPositionId: values.toPositionId || null,
        newSalary: values.newSalary ?? null,
      };
      return api.events.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['assignments'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      toast.success('Кадровое событие создано');
      onClose();
    },
    onError: (error) => toast.error('Не удалось создать событие', getErrorMessage(error)),
  });

  const changeType = (type: HrEventType) => {
    const previousDefaults = availableTypes.map((item) => eventTypeMeta[item].label);
    setValues((prev) => ({
      ...prev,
      type,
      title: !prev.title || previousDefaults.includes(prev.title) ? eventTypeMeta[type].label : prev.title,
      toDepartmentId: type === 'transfer' ? prev.toDepartmentId : null,
      toPositionId: type === 'transfer' || type === 'promotion' ? prev.toPositionId : null,
      newSalary: (type === 'promotion' || type === 'salary_change') && canEditSalary ? prev.newSalary : null,
    }));
  };

  const employee = values.employeeId ? employeeById.get(values.employeeId) : null;
  const employeePosition = employee
    ? positions.find((position) => position.id === employee.positionId)
    : null;
  const selectedPosition = positions.find((position) => position.id === values.toPositionId);
  const showDepartment = values.type === 'transfer';
  const showPosition = values.type === 'transfer' || values.type === 'promotion';
  const showSalary = (values.type === 'promotion' || values.type === 'salary_change') && canEditSalary;

  // Повышение — только выше по грейду в своей ветке и подразделении.
  const promotionPositions = employee
    ? positions.filter(
        (position) =>
          position.departmentId === employee.departmentId &&
          (!employeePosition || position.family === employeePosition.family) &&
          (!employeePosition || position.grade > employeePosition.grade),
      )
    : [];

  // Перевод — должности целевого подразделения (или текущего, если не меняем).
  const transferDepartmentId = values.toDepartmentId ?? employee?.departmentId ?? '';
  const transferPositions = positions.filter(
    (position) => !transferDepartmentId || position.departmentId === transferDepartmentId,
  );
  const positionOptions = values.type === 'promotion' ? promotionPositions : transferPositions;

  useEffect(() => {
    if (!showPosition || !values.toPositionId) return;
    if (!positionOptions.some((position) => position.id === values.toPositionId)) {
      setValues((prev) => ({ ...prev, toPositionId: null, newSalary: null }));
    }
  }, [showPosition, positionOptions, values.toPositionId]);

  let positionError: string | undefined;
  if (values.type === 'promotion') {
    if (!values.toPositionId) {
      positionError = promotionPositions.length
        ? 'Выберите новую должность'
        : 'В этой ветке нет должности выше по грейду — оформите перевод';
    } else if (!selectedPosition || !promotionPositions.some((p) => p.id === selectedPosition.id)) {
      positionError = 'Повышение — только выше по грейду в своей ветке';
    }
  } else if (values.type === 'transfer') {
    if (
      values.toDepartmentId &&
      employee &&
      values.toDepartmentId !== employee.departmentId &&
      !values.toPositionId
    ) {
      positionError = 'Выберите должность в новом подразделении';
    } else if (selectedPosition && transferDepartmentId && selectedPosition.departmentId !== transferDepartmentId) {
      positionError = 'Должность относится к другому подразделению';
    }
  }
  const valid = Boolean(
    values.employeeId &&
      values.date &&
      values.title.trim() &&
      !positionError &&
      !dismissalBlocked,
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={
        lockEmployee && defaultType === 'promotion'
          ? 'Повышение сотрудника'
          : 'Новое кадровое событие'
      }
      description={
        role === 'admin'
          ? 'Приём, перевод, повышение, изменение оклада или увольнение'
          : 'Приём, перевод или повышение'
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!valid}>
            Создать событие
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Сотрудник *"
          className="sm:col-span-2"
          hint={lockEmployee ? 'Сотрудник зафиксирован по карточке' : undefined}
        >
          <Select
            value={values.employeeId}
            disabled={lockEmployee}
            onChange={(event) => setValues((prev) => ({ ...prev, employeeId: event.target.value }))}
          >
            <option value="">Выберите сотрудника</option>
            {employees
              .filter((item) => item.status !== 'dismissed')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {fullName(item)}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Тип события">
          <Select value={values.type} onChange={(event) => changeType(event.target.value as HrEventType)}>
            {availableTypes.map((type) => (
              <option key={type} value={type}>
                {eventTypeMeta[type].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Дата *">
          <Input
            type="date"
            value={values.date}
            onChange={(event) => setValues((prev) => ({ ...prev, date: event.target.value }))}
          />
        </Field>
        <Field label="Заголовок *" className="sm:col-span-2">
          <Input
            value={values.title}
            onChange={(event) => setValues((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Например: перевод в отдел разработки"
          />
        </Field>

        {showDepartment ? (
          <Field label="Новое подразделение">
            <Select
              value={values.toDepartmentId ?? ''}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  toDepartmentId: event.target.value || null,
                  toPositionId: null,
                  newSalary: null,
                }))
              }
            >
              <option value="">Не менять</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {showPosition ? (
          <Field
            label={values.type === 'promotion' ? 'Новая должность *' : 'Новая должность'}
            error={positionError}
            hint={
              values.type === 'promotion'
                ? employeePosition
                  ? `Текущая: ${employeePosition.name}. Доступны должности выше по грейду в ветке «${employeePosition.family}».`
                  : 'Оклад по умолчанию — нижняя граница вилки'
                : transferDepartmentId
                  ? 'Список ограничен должностями выбранного подразделения'
                  : undefined
            }
          >
            <Select
              value={values.toPositionId ?? ''}
              onChange={(event) => {
                const positionId = event.target.value || null;
                const position = positions.find((item) => item.id === positionId);
                setValues((prev) => ({
                  ...prev,
                  toPositionId: positionId,
                  newSalary:
                    prev.type === 'promotion' && position
                      ? position.salaryMin
                      : prev.newSalary,
                }));
              }}
            >
              <option value="">
                {values.type === 'promotion'
                  ? promotionPositions.length
                    ? 'Выберите должность'
                    : 'Нет доступных должностей'
                  : 'Не менять'}
              </option>
              {positionOptions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name} · {position.family} · грейд {position.grade}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        {showSalary ? (
          <Field
            label="Новый оклад, ₽"
            hint={
              values.type === 'promotion' && selectedPosition
                ? `Вилка: ${selectedPosition.salaryMin.toLocaleString('ru-RU')} – ${selectedPosition.salaryMax.toLocaleString('ru-RU')} ₽`
                : employee
                  ? `Текущий: ${employee.salary.toLocaleString('ru-RU')} ₽`
                  : undefined
            }
          >
            <Input
              type="number"
              min={0}
              step={1000}
              value={values.newSalary ?? ''}
              onChange={(event) =>
                setValues((prev) => ({
                  ...prev,
                  newSalary: event.target.value ? Number(event.target.value) : null,
                }))
              }
              placeholder="Не менять"
            />
          </Field>
        ) : values.type === 'promotion' && selectedPosition ? (
          <Field label="Новый оклад">
            <div className="flex h-10 items-center rounded-xl bg-surface-2/60 px-3 text-sm text-fg">
              {selectedPosition.salaryMin.toLocaleString('ru-RU')} ₽
            </div>
            <p className="mt-1 text-[11px] text-muted">
              Установится автоматически по нижней границе вилки. Изменить оклад может администратор.
            </p>
          </Field>
        ) : null}

        <Field label="Комментарий" className="sm:col-span-2">
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Основание, детали или номер приказа"
          />
        </Field>

        {values.type === 'dismissal' ? (
          <>
            <div className="border border-danger/30 px-3 py-2 text-[11px] text-danger sm:col-span-2">
              После создания события сотрудник получит статус «Уволен», а доступ будет заблокирован.
            </div>
            <TaskReassignBlock
              tasks={activeTasks}
              assignments={reassignAssignments}
              employees={employees}
              projectById={projectById}
              excludeEmployeeId={values.employeeId}
              value={reassignments}
              onChange={(taskId, target) =>
                setReassignments((previous) => ({ ...previous, [taskId]: target }))
              }
              mode="dismiss"
            />
            <ProjectReassignBlock
              projects={managedProjects}
              employees={employees}
              excludeEmployeeId={values.employeeId}
              value={projectReassignments}
              onChange={(projectId, target) =>
                setProjectReassignments((previous) => ({ ...previous, [projectId]: target }))
              }
            />
            {dismissalBlocked && !activeTasksQuery.isLoading ? (
              <p className="text-[11px] text-muted sm:col-span-2">
                Осталось переназначить: задачи — {pendingTasks.length}, проекты —{' '}
                {pendingProjects.length}.
              </p>
            ) : null}
          </>
        ) : null}
        {values.type === 'hire' ? (
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[11px] text-fg sm:col-span-2">
            Событие приёма обновит дату приёма сотрудника. Для нового сотрудника используйте раздел
            «Сотрудники».
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
