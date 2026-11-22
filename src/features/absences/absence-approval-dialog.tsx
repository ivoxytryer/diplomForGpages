import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api';
import { getErrorMessage } from '@/shared/api/client';
import type { Absence } from '@/shared/types';
import { useLookups } from '@/shared/hooks/use-lookups';
import { absenceTypeMeta } from '@/shared/lib/meta';
import { fullName } from '@/shared/lib/utils';
import { TaskReassignBlock } from '@/features/employees/task-reassign-block';
import { Dialog } from '@/shared/ui/overlay';
import { Button } from '@/shared/ui/button';
import { useToast } from '@/shared/ui/toast';

/**
 * Согласование больничного или командировки: активные задачи сотрудника
 * обязательно передаются коллегам по проекту.
 */
export function AbsenceApprovalDialog({
  open,
  absence,
  onClose,
  onApproved,
}: {
  open: boolean;
  absence: Absence | null;
  onClose: () => void;
  onApproved: () => void;
}) {
  const { employees, employeeById, projectById } = useLookups();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [reassignments, setReassignments] = useState<Record<string, string>>({});

  const tasksQuery = useQuery({
    queryKey: ['tasks', 'absence-approval', absence?.id],
    queryFn: () =>
      api.tasks.list({ employeeId: absence!.employeeId, status: 'todo' }),
    enabled: open && Boolean(absence),
  });
  const assignmentsQuery = useQuery({
    queryKey: ['assignments', 'absence-approval'],
    queryFn: () => api.assignments.list(),
    enabled: open && Boolean(absence),
  });

  useEffect(() => {
    if (open) setReassignments({});
  }, [open, absence?.id]);

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const assignments = assignmentsQuery.data ?? [];
  const employee = absence ? employeeById.get(absence.employeeId) : null;
  const pending = tasks.filter((task) => !reassignments[task.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      for (const task of tasks) {
        const target = reassignments[task.id];
        if (target) await api.tasks.update(task.id, { employeeId: target });
      }
      await api.absences.setStatus(absence!.id, 'approved');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['project'] });
      queryClient.invalidateQueries({ queryKey: ['employee'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['timesheet'] });
      queryClient.invalidateQueries({ queryKey: ['audit'] });
      toast.success('Отсутствие согласовано, задачи переданы');
      onApproved();
      onClose();
    },
    onError: (error) => toast.error('Не удалось согласовать', getErrorMessage(error)),
  });

  const loading = tasksQuery.isLoading || assignmentsQuery.isLoading;
  const valid = Boolean(absence) && !loading && tasks.length > 0 && pending.length === 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Согласование отсутствия"
      description={
        absence && employee
          ? `${absenceTypeMeta[absence.type].label} · ${fullName(employee)}`
          : undefined
      }
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!valid}
          >
            Согласовать и передать задачи
          </Button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-muted">Загружаем активные задачи…</p>
      ) : (
        <>
          <TaskReassignBlock
            tasks={tasks}
            assignments={assignments}
            employees={employees}
            projectById={projectById}
            excludeEmployeeId={absence?.employeeId ?? ''}
            value={reassignments}
            onChange={(taskId, target) =>
              setReassignments((previous) => ({ ...previous, [taskId]: target }))
            }
            mode="absence"
          />
          {tasks.length > 0 && pending.length > 0 ? (
            <p className="mt-2 text-xs text-muted">
              Осталось выбрать исполнителя: {pending.length}.
            </p>
          ) : null}
        </>
      )}
    </Dialog>
  );
}
