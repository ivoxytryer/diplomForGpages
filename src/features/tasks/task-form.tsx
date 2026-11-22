import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { ProjectTask } from '@/shared/types';
import { useAuthStore } from '@/features/auth/auth-store';
import { useLookups } from '@/shared/hooks/use-lookups';
import { employeeOptionLabel, fullName, todayISO } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select, Textarea } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

interface TaskFormProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  employeeId?: string;
  task?: ProjectTask | null;
}

interface TaskFormState {
  projectId: string;
  employeeId: string;
  title: string;
  description: string;
  dueDate: string;
  estimateHours: string;
}

function defaults(
  projectId?: string,
  employeeId?: string,
  task?: ProjectTask | null,
): TaskFormState {
  return {
    projectId: task?.projectId ?? projectId ?? '',
    employeeId: task?.employeeId ?? employeeId ?? '',
    title: task?.title ?? '',
    description: task?.description ?? '',
    dueDate: task?.dueDate ?? todayISO(),
    estimateHours:
      task?.estimateHours === null || task?.estimateHours === undefined
        ? ''
        : String(task.estimateHours),
  };
}

export function TaskForm({ open, onClose, projectId, employeeId, task }: TaskFormProps) {
  const { projects, employees, departmentById } = useLookups();
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();
  const toast = useToast();
  const isManager = user?.role === 'manager';
  const [form, setForm] = useState<TaskFormState>(() =>
    defaults(projectId, employeeId, task),
  );
  const [error, setError] = useState('');

  const assignmentsQuery = useQuery({
    queryKey: ['assignments'],
    queryFn: () => api.assignments.list(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    setForm(defaults(projectId, employeeId, task));
    setError('');
  }, [open, projectId, employeeId, task]);

  const assignments = useMemo(() => assignmentsQuery.data ?? [], [assignmentsQuery.data]);
  const editing = Boolean(task);

  const availableProjects = useMemo(() => {
    return projects.filter((project) => {
      if (isManager && project.managerId !== user?.employeeId) return false;
      if (project.status === 'completed' && project.id !== task?.projectId) return false;
      if (employeeId) {
        return assignments.some(
          (assignment) =>
            assignment.projectId === project.id && assignment.employeeId === employeeId,
        );
      }
      return true;
    });
  }, [projects, assignments, employeeId, task?.projectId, isManager, user?.employeeId]);

  const assignedEmployees = useMemo(() => {
    if (!form.projectId) return [];
    const ids = new Set(
      assignments
        .filter((assignment) => assignment.projectId === form.projectId)
        .map((assignment) => assignment.employeeId),
    );
    return employees.filter(
      (employee) => ids.has(employee.id) && employee.status !== 'dismissed',
    );
  }, [assignments, employees, form.projectId]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        dueDate: form.dueDate,
        estimateHours:
          form.estimateHours.trim() === '' ? null : Number(form.estimateHours),
      };
      if (task) return api.tasks.update(task.id, payload);
      return api.tasks.create({
        ...payload,
        projectId: form.projectId,
        employeeId: form.employeeId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(task ? 'Задача обновлена' : 'Задача создана');
      onClose();
    },
    onError: (mutationError) =>
      setError(getErrorMessage(mutationError)),
  });

  const update = <Key extends keyof TaskFormState>(key: Key, value: TaskFormState[Key]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const submit = () => {
    if (!form.projectId) return setError('Выберите проект');
    if (!form.employeeId) return setError('Выберите сотрудника');
    if (!form.title.trim()) return setError('Укажите название задачи');
    if (!form.dueDate) return setError('Укажите плановую дату');
    setError('');
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={task ? 'Изменить задачу' : 'Новая задача'}
      description={
        task
          ? 'Обновите параметры задачи. Сотрудник увидит изменения сразу.'
          : 'Задача появится у сотрудника в разделе «Задачи» и в карточке проекта.'
      }
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} loading={mutation.isPending}>
            {task ? 'Сохранить' : 'Создать задачу'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Проект">
            <Select
              value={form.projectId}
              disabled={editing}
              onChange={(event) => {
                const nextProjectId = event.target.value;
                setForm((previous) => {
                  const stillAssigned = assignments.some(
                    (assignment) =>
                      assignment.projectId === nextProjectId &&
                      assignment.employeeId === previous.employeeId,
                  );
                  return {
                    ...previous,
                    projectId: nextProjectId,
                    employeeId: stillAssigned ? previous.employeeId : '',
                  };
                });
              }}
            >
              <option value="">Выберите проект</option>
              {availableProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Сотрудник"
            hint={
              form.projectId
                ? 'Список ограничен участниками проекта'
                : 'Сначала выберите проект'
            }
          >
            <Select
              value={form.employeeId}
              disabled={editing || !form.projectId}
              onChange={(event) => update('employeeId', event.target.value)}
            >
              <option value="">Выберите сотрудника</option>
              {assignedEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employeeOptionLabel(
                    fullName(employee),
                    departmentById.get(employee.departmentId)?.name,
                  )}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Название задачи">
          <Input
            value={form.title}
            onChange={(event) => update('title', event.target.value)}
            placeholder="Например: подготовить макет личного кабинета"
          />
        </Field>

        <Field label="Описание" hint="Необязательно">
          <Textarea
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            placeholder="Что нужно сделать и на что обратить внимание"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Плановая дата">
            <Input
              type="date"
              value={form.dueDate}
              onChange={(event) => update('dueDate', event.target.value)}
            />
          </Field>
          <Field label="Оценка, часов" hint="Необязательно">
            <Input
              type="number"
              min={0}
              step={0.5}
              value={form.estimateHours}
              onChange={(event) => update('estimateHours', event.target.value)}
              placeholder="Например: 4"
            />
          </Field>
        </div>

        {!editing ? (
          <p className="rounded-lg bg-surface-2/60 px-3 py-2 text-xs text-muted">
            Создавать задачи могут администраторы и руководители. Сотрудник увидит задачу
            и сможет отметить её выполненной или перенести на следующий рабочий день.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-lg border border-danger/30 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}
