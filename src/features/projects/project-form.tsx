import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Project, ProjectPayload } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { projectStatusMeta } from '@/shared/lib/meta';
import { can } from '@/shared/lib/permissions';
import { useLookups } from '@/shared/hooks/use-lookups';
import { employeeOptionLabel, fullName, todayISO } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select, Textarea } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

function defaults(project: Project | null | undefined, fallbackManagerId?: string | null): ProjectPayload {
  return {
    code: project?.code ?? '',
    name: project?.name ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'planning',
    startDate: project?.startDate ?? todayISO(),
    endDate: project?.endDate ?? null,
    managerId: project?.managerId ?? fallbackManagerId ?? null,
    color: project?.color ?? '#71717a',
  };
}

export function ProjectForm({
  open,
  onClose,
  project,
}: {
  open: boolean;
  onClose: () => void;
  project?: Project | null;
}) {
  const { employees, departmentById } = useLookups();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const toast = useToast();
  const isManager = user?.role === 'manager';
  const canManageManager = can(user?.role, 'projects:manage-manager');
  // Manager может передать только уже существующий свой проект;
  // при создании он всегда руководитель.
  const canAssignManager = canManageManager && (!isManager || Boolean(project));
  const fallbackManagerId = isManager ? (user?.employeeId ?? null) : null;
  const [values, setValues] = useState<ProjectPayload>(() =>
    defaults(project, fallbackManagerId),
  );

  useEffect(() => {
    if (!open) return;
    setValues(defaults(project, fallbackManagerId));
  }, [open, project, fallbackManagerId]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload: ProjectPayload = {
        ...values,
        endDate: values.endDate || null,
        managerId: values.managerId || null,
        description: values.description || undefined,
      };
      return project ? api.projects.update(project.id, payload) : api.projects.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['workload'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(project ? 'Проект обновлён' : 'Проект создан');
      onClose();
    },
    onError: (error) => toast.error('Не удалось сохранить проект', getErrorMessage(error)),
  });

  const valid =
    values.code.trim().length > 0 &&
    values.name.trim().length > 0 &&
    (!values.endDate || values.endDate >= values.startDate);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project ? 'Редактирование проекта' : 'Новый проект'}
      description="Проект используется для матрицы загрузки сотрудников"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => mutation.mutate()} loading={mutation.isPending} disabled={!valid}>
            Сохранить
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Код *">
          <Input
            value={values.code}
            onChange={(event) => setValues((prev) => ({ ...prev, code: event.target.value }))}
            placeholder="ERP"
          />
        </Field>
        <Field label="Статус">
          <Select
            value={values.status}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, status: event.target.value as ProjectPayload['status'] }))
            }
          >
            {Object.entries(projectStatusMeta).map(([value, meta]) => (
              <option key={value} value={value}>
                {meta.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Название *" className="sm:col-span-2">
          <Input
            value={values.name}
            onChange={(event) => setValues((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Внедрение ERP-системы"
          />
        </Field>
        <Field label="Дата начала">
          <Input
            type="date"
            value={values.startDate}
            onChange={(event) => setValues((prev) => ({ ...prev, startDate: event.target.value }))}
          />
        </Field>
        <Field
          label="Дата окончания"
          error={
            values.endDate && values.endDate < values.startDate
              ? 'Дата окончания раньше даты начала'
              : undefined
          }
        >
          <Input
            type="date"
            value={values.endDate ?? ''}
            onChange={(event) => setValues((prev) => ({ ...prev, endDate: event.target.value || null }))}
          />
        </Field>
        <Field
          label="Руководитель проекта"
          hint={
            isManager
              ? project
                ? 'Передача проекта: после сохранения управление перейдёт новому руководителю'
                : 'Вы назначены руководителем как автор проекта'
              : undefined
          }
        >
          {canAssignManager ? (
            <Select
              value={values.managerId ?? ''}
              onChange={(event) =>
                setValues((prev) => ({ ...prev, managerId: event.target.value || null }))
              }
            >
              {isManager ? null : <option value="">Не назначен</option>}
              {employees
                .filter((employee) => employee.status !== 'dismissed')
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employeeOptionLabel(
                      fullName(employee),
                      departmentById.get(employee.departmentId)?.name,
                    )}
                  </option>
                ))}
            </Select>
          ) : (
            <div className="flex h-10 items-center rounded-xl bg-surface-2/60 px-3 text-sm text-fg">
              {user?.name ?? 'Не назначен'}
            </div>
          )}
        </Field>
        <Field label="Описание" className="sm:col-span-2">
          <Textarea
            value={values.description ?? ''}
            onChange={(event) => setValues((prev) => ({ ...prev, description: event.target.value }))}
            placeholder="Цели, содержание и ожидаемый результат проекта"
          />
        </Field>
      </div>
    </Dialog>
  );
}
