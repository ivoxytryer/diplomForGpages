import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Assignment, AssignmentPayload } from '@/shared/types';
import { useLookups } from '@/shared/hooks/use-lookups';
import { findEmployeeAbsenceNote } from '@/shared/lib/absences';
import { absenceTypeMeta } from '@/shared/lib/meta';
import { cn, employeeOptionLabel, formatDate, fullName, todayISO } from '@/shared/lib/utils';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { Field, Input, Select } from '@/shared/ui/primitives';
import { useToast } from '@/shared/ui/toast';

interface AssignmentFormProps {
  open: boolean;
  onClose: () => void;
  projectId?: string;
  employeeId?: string;
  assignment?: Assignment | null;
}

function defaults(projectId?: string, employeeId?: string, assignment?: Assignment | null): AssignmentPayload {
  return {
    projectId: assignment?.projectId ?? projectId ?? '',
    employeeId: assignment?.employeeId ?? employeeId ?? '',
    projectRole: assignment?.projectRole ?? 'Участник',
    allocation: assignment?.allocation ?? 50,
    startDate: assignment?.startDate ?? todayISO(),
    endDate: assignment?.endDate ?? null,
  };
}

export function AssignmentForm({ open, onClose, projectId, employeeId, assignment }: AssignmentFormProps) {
  const {
    projects,
    employees,
    positions,
    projectById,
    employeeById,
    departmentById,
    positionById,
  } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [values, setValues] = useState<AssignmentPayload>(() => defaults(projectId, employeeId, assignment));
  const [filterPositionId, setFilterPositionId] = useState('');

  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'all'],
    queryFn: () => api.assignments.list({}),
  });

  const absencesQuery = useQuery({
    queryKey: ['absences', 'assignment-picker'],
    queryFn: () => api.absences.list({}),
  });

  useEffect(() => {
    if (!open) return;
    setValues(defaults(projectId, employeeId, assignment));
  }, [open, projectId, employeeId, assignment]);

  const fixedProject = assignment?.projectId ?? projectId;
  const fixedEmployee = assignment?.employeeId ?? employeeId;
  const today = todayISO();

  // Суммарная активная загрузка сотрудников по всем проектам.
  const loads = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of assignmentsQuery.data ?? []) {
      if (item.endDate && item.endDate < today) continue;
      if (projectById.get(item.projectId)?.status === 'completed') continue;
      map.set(item.employeeId, (map.get(item.employeeId) ?? 0) + item.allocation);
    }
    return map;
  }, [assignmentsQuery.data, projectById, today]);

  const filteredEmployees = useMemo(
    () =>
      employees.filter(
        (employee) =>
          employee.status !== 'dismissed' &&
          (!filterPositionId || employee.positionId === filterPositionId),
      ),
    [employees, filterPositionId],
  );

  const selectedEmployee = values.employeeId ? employeeById.get(values.employeeId) : null;
  const absenceFor = (employeeId: string) =>
    findEmployeeAbsenceNote(absencesQuery.data ?? [], employeeId, today);
  const absenceLabel = (employeeId: string) => {
    const note = absenceFor(employeeId);
    if (!note) return '';
    const label = absenceTypeMeta[note.absence.type].label;
    return note.active
      ? `${label} до ${formatDate(note.absence.endDate)}`
      : `${label} с ${formatDate(note.absence.startDate)}`;
  };
  const selectedAbsence = selectedEmployee ? absenceFor(selectedEmployee.id) : null;
  const currentLoad = selectedEmployee ? (loads.get(selectedEmployee.id) ?? 0) : 0;
  const baseLoad =
    selectedEmployee && assignment && assignment.employeeId === selectedEmployee.id
      ? Math.max(0, currentLoad - assignment.allocation)
      : currentLoad;
  const projectedLoad = baseLoad + (Number(values.allocation) || 0);

  useEffect(() => {
    if (!values.employeeId || fixedEmployee) return;
    if (!filteredEmployees.some((employee) => employee.id === values.employeeId)) {
      setValues((prev) => ({ ...prev, employeeId: '' }));
    }
  }, [filteredEmployees, values.employeeId, fixedEmployee]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['assignments'] });
    queryClient.invalidateQueries({ queryKey: ['workload'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['employee'] });
    queryClient.invalidateQueries({ queryKey: ['project'] });
  };

  const mutation = useMutation({
    mutationFn: () => {
      const payload: AssignmentPayload = { ...values, endDate: values.endDate || null };
      return assignment ? api.assignments.update(assignment.id, payload) : api.assignments.create(payload);
    },
    onSuccess: () => {
      invalidate();
      toast.success(assignment ? 'Назначение обновлено' : 'Сотрудник назначен на проект');
      onClose();
    },
    onError: (error) => toast.error('Не удалось сохранить назначение', getErrorMessage(error)),
  });

  const removeMutation = useMutation({
    mutationFn: () => api.assignments.remove(assignment!.id),
    onSuccess: () => {
      invalidate();
      toast.success('Назначение удалено');
      onClose();
    },
    onError: (error) => toast.error('Не удалось удалить назначение', getErrorMessage(error)),
  });

  const valid = Boolean(
    values.projectId &&
      values.employeeId &&
      values.allocation >= 0 &&
      values.allocation <= 100 &&
      (assignment || !selectedEmployee || currentLoad < 100) &&
      (!values.endDate || values.endDate >= values.startDate),
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={assignment ? 'Изменение назначения' : 'Назначение на проект'}
      description="Загрузка в процентах от рабочего времени"
      size="md"
      footer={
        <>
          {assignment ? (
            <Button
              variant="danger"
              className="mr-auto"
              loading={removeMutation.isPending}
              onClick={() => {
                if (window.confirm('Удалить назначение сотрудника на проект?')) removeMutation.mutate();
              }}
            >
              Удалить
            </Button>
          ) : null}
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
        <Field label="Проект" className="sm:col-span-2">
          {fixedProject ? (
            <div className="flex h-9 items-center rounded-lg bg-surface-2 px-3 text-sm text-fg">
              {projectById.get(fixedProject)?.name ?? fixedProject}
            </div>
          ) : (
            <Select
              value={values.projectId}
              onChange={(event) => setValues((prev) => ({ ...prev, projectId: event.target.value }))}
            >
              <option value="">Выберите проект</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        {!fixedEmployee ? (
          <Field label="Должность" className="sm:col-span-2">
            <Select
              value={filterPositionId}
              onChange={(event) => setFilterPositionId(event.target.value)}
            >
              <option value="">Все должности</option>
              {positions.map((position) => (
                <option key={position.id} value={position.id}>
                  {position.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field label="Сотрудник" className="sm:col-span-2">
          {fixedEmployee ? (
            <div className="flex h-9 items-center rounded-lg bg-surface-2 px-3 text-sm text-fg">
              {employeeOptionLabel(
                fullName(employeeById.get(fixedEmployee)),
                departmentById.get(employeeById.get(fixedEmployee)?.departmentId ?? '')?.name,
              )}
            </div>
          ) : (
            <Select
              value={values.employeeId}
              onChange={(event) => setValues((prev) => ({ ...prev, employeeId: event.target.value }))}
            >
              <option value="">Выберите сотрудника</option>
              {filteredEmployees.map((employee) => {
                const load = loads.get(employee.id) ?? 0;
                const loadLabel =
                  load > 100
                    ? ` · перегруз ${load}%`
                    : load === 100
                      ? ' · занят на 100%'
                      : load > 0
                        ? ` · загрузка ${load}%`
                        : '';
                const absence = absenceLabel(employee.id);
                return (
                  <option
                    key={employee.id}
                    value={employee.id}
                    disabled={load >= 100}
                    className={load >= 100 ? 'text-muted' : undefined}
                  >
                    {fullName(employee)} · {positionById.get(employee.positionId)?.name ?? '—'} ·{' '}
                    {departmentById.get(employee.departmentId)?.name ?? '—'}
                    {absence ? ` · ${absence}` : ''}
                    {loadLabel}
                  </option>
                );
              })}
            </Select>
          )}
          {selectedEmployee ? (
            <p
              className={cn(
                'mt-1 text-[11px]',
                currentLoad >= 100 || projectedLoad > 100
                  ? 'font-medium text-danger'
                  : 'text-muted',
              )}
            >
              {currentLoad >= 100 && !assignment
                ? `Сотрудник уже загружен на ${currentLoad}% — назначение недоступно`
                : `Загрузка сейчас: ${currentLoad}% · после назначения: ${projectedLoad}%${
                    projectedLoad > 100 ? ' — перегруз' : ''
                  }`}
            </p>
          ) : null}
          {selectedAbsence ? (
            <p className="mt-1 text-[11px] text-muted">
              {selectedAbsence.active
                ? `Сейчас: ${absenceLabel(selectedEmployee?.id ?? '')}. Назначить можно — участие начнётся после выхода.`
                : `Запланировано: ${absenceLabel(selectedEmployee?.id ?? '')}. Назначение можно оформить заранее.`}
            </p>
          ) : null}
        </Field>

        <Field label="Роль в проекте">
          <Input
            value={values.projectRole}
            onChange={(event) => setValues((prev) => ({ ...prev, projectRole: event.target.value }))}
            placeholder="Разработчик"
          />
        </Field>
        <Field label="Загрузка, %" hint="От 0 до 100">
          <Input
            type="number"
            min={0}
            max={100}
            step={5}
            value={values.allocation}
            onChange={(event) =>
              setValues((prev) => ({ ...prev, allocation: Number(event.target.value) }))
            }
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
      </div>
    </Dialog>
  );
}
